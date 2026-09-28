// =====================================================================
// Script do Cyclos chamado pelo programa em /web/run/invoice.
//
// O programa envia (JSON):
//   url_pdf            link do PDF da fatura no ZSGO            (sempre)
//   userid             utilizador do Cyclos                      (sempre)
//   ano, mes           mês faturado                              (sempre, versões novas)
//   zsgo_id            id da fatura no ZSGO                       (sempre, versões novas)
//   numero             nome da fatura, ex. "FR API-FR/11385"      (quando o ZSGO o devolve)
//   substitui_zsgo_id  id da fatura ANULADA que esta substitui    (só na refaturação)
//
// Antes de usar: no tipo de registo "UR_Invoices" criar o campo
//   UR_Invoices_F_ZsgoId   (texto de uma linha)
// Se o campo não existir o script continua a funcionar, mas não consegue
// reconhecer as faturas que cria (só pelo link, ver removerFaturaAntiga).
// =====================================================================
import org.cyclos.model.users.users.UserLocatorVO
import org.cyclos.model.users.users.UserVO
import org.cyclos.model.users.records.*
import org.cyclos.model.system.fields.CustomFieldValueDTO
import org.cyclos.model.users.recordtypes.RecordTypeVO
import org.cyclos.model.ValidationException
import groovy.json.JsonSlurper
import groovy.json.JsonOutput

final String TIPO = "UR_Invoices"
final String CAMPO_LINK = "UR_Invoices_F_InvoiceHtmlLink"
final String CAMPO_ZSGO = "UR_Invoices_F_ZsgoId"

def json = new JsonSlurper().parse(request.body)

Long userId = json.userid as Long
String pdfUrl = json.url_pdf
String zsgoId = json.zsgo_id ?: null
String substituiId = json.substitui_zsgo_id ?: null
String numero = json.numero ?: null
Integer ano = json.ano ? (json.ano as Integer) : null
Integer mes = json.mes ? (json.mes as Integer) : null

// Texto do link: o nome da fatura (ex.: "FR API-FR/11385"); sem nome, o mês.
String textoLink = numero ?: (ano && mes ? "Fatura ${String.format('%02d', mes)}/${ano}" : "Fatura")

UserVO user = localizarUtilizador(userId)

// 1. Cria sempre primeiro o registo da fatura nova…
criarInvoice(user, pdfUrl, textoLink, zsgoId, TIPO, CAMPO_LINK, CAMPO_ZSGO)

// 2. …e só depois, numa refaturação, apaga o registo da fatura anulada.
//    (Se falhar a meio, o cliente nunca fica sem fatura no Cyclos.)
int removidos = 0
if (substituiId) {
    removidos = removerFaturaAntiga(user, substituiId, zsgoId, TIPO, CAMPO_LINK, CAMPO_ZSGO)
}

return JsonOutput.toJson([ok: true, removidos: removidos])


// ---------------------------------------------------------------------

UserVO localizarUtilizador(Long userId) {
    UserLocatorVO locator = new UserLocatorVO()
    locator.id = userId
    UserVO userVO = binding.userServiceSecurity.locate(locator)
    if (!userVO) {
        throw new ValidationException("Utilizador não encontrado: ${userId}")
    }
    return userVO
}

def criarInvoice(UserVO user, String invoiceLink, String textoLink, String zsgoId, String tipo, String campoLink, String campoZsgo) {
    try {
        RecordDataParams dataParams = new RecordDataParams()
        dataParams.setRecordType(new RecordTypeVO(RecordTypeVO.INTERNAL_NAME, tipo))
        RecordData data = binding.recordService.getDataForNew(dataParams)
        UserRecordDTO newRecord = data.dto

        newRecord.customValues = data.fields.collect { field ->
            CustomFieldValueDTO dto = new CustomFieldValueDTO()
            dto.field = field
            if (field.internalName == campoLink) {
                String texto = textoLink.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                dto.richTextValue = "<a href=\"${invoiceLink}\" target=\"_blank\">${texto}</a>"
            } else if (field.internalName == campoZsgo && zsgoId) {
                dto.stringValue = zsgoId
            }
            return dto
        }
        newRecord.user = user

        def saved = binding.recordServiceSecurity.save(newRecord)
        binding.recordService.load(saved)
        return true
    } catch (Exception e) {
        throw new ValidationException("Erro ao criar ${tipo}: ${e.message}")
    }
}

/**
 * Apaga o(s) registo(s) UR_Invoices deste utilizador que pertencem à fatura
 * anulada: pelo campo UR_Invoices_F_ZsgoId ou, nos registos antigos (sem
 * esse campo), se o link do PDF contiver o id da fatura anulada.
 * Nunca apaga o registo da fatura nova. Devolve quantos apagou.
 */
int removerFaturaAntiga(UserVO user, String idAnulado, String idNovo, String tipo, String campoLink, String campoZsgo) {
    try {
        UserRecordQuery query = new UserRecordQuery()
        query.type = new RecordTypeVO(RecordTypeVO.INTERNAL_NAME, tipo)
        UserLocatorVO locator = new UserLocatorVO()
        locator.id = user.id
        query.user = locator
        query.setUnlimited()

        int removidos = 0
        def pagina = binding.recordService.search(query)
        pagina.pageItems.each { rec ->
            def dto = binding.recordService.load(rec.id)
            String zsgo = null
            String link = null
            dto.customValues.each { v ->
                if (v.field?.internalName == campoZsgo) zsgo = v.stringValue
                if (v.field?.internalName == campoLink) link = v.richTextValue
            }
            boolean eDaAnulada = (zsgo && zsgo == idAnulado) || (!zsgo && link && link.contains(idAnulado))
            boolean eDaNova = idNovo && zsgo == idNovo
            if (eDaAnulada && !eDaNova) {
                binding.recordServiceSecurity.remove(rec.id)
                removidos++
            }
        }
        return removidos
    } catch (Exception e) {
        throw new ValidationException("Fatura nova criada, mas erro ao apagar a antiga (${idAnulado}): ${e.message}")
    }
}
