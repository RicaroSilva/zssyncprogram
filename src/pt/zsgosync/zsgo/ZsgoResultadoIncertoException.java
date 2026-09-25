package pt.zsgosync.zsgo;

/**
 * O pedido chegou (ou pode ter chegado) ao ZSGO, mas não houve resposta:
 * não se sabe se o documento foi criado. Nestes casos NUNCA se volta a
 * enviar automaticamente — era isso que criava faturas em duplicado.
 */
public class ZsgoResultadoIncertoException extends ZsgoApiException {
   public ZsgoResultadoIncertoException(String mensagem, Throwable causa) {
      super(mensagem, causa);
   }
}
