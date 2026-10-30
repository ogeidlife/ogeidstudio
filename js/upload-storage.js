/* =========================================================
   UPLOAD PERMANENTE (INTEGRAÇÃO FUTURA — DESLIGADA)

   Hoje os .stl enviados no configurador vivem só na sessão do
   navegador (URL.createObjectURL) e desaparecem ao fechar a aba.
   O site é estático: não há servidor para guardar arquivos.

   Quando quiser guardar os arquivos dos clientes, ligue ESTE módulo
   a um destino seguro — sem colocar nenhuma credencial secreta no
   código do site:

   Opção A — Firebase Storage (você já usa Firebase no projeto):
     1. Ative o Storage e o Firebase Authentication anônimo.
     2. Regras do Storage: permitir só "create" em /encomendas/{uid}/*,
        com limite de tamanho (request.resource.size < 50MB) e tipo
        (.stl). Nada de leitura pública.
     3. Ative o App Check (reCAPTCHA) para barrar uso indevido.
     4. Implemente enviarArquivo() abaixo com uploadBytesResumable().

   Opção B — um backend seu (ex.: Cloud Function) que devolve uma
   URL assinada de envio; o navegador só recebe a URL temporária.

   As chaves públicas do Firebase (js/firebase-config.js) NÃO são
   segredo, mas as REGRAS de segurança é que protegem os dados.
   ========================================================= */

export const UPLOAD_ATIVO = false;

/**
 * @param {File} file   arquivo .stl já validado
 * @param {{papel: "personagem"|"cenario", onProgresso?: (0..1)=>void}} opcoes
 * @returns {Promise<{ id: string }>} identificador para anexar à encomenda
 */
export async function enviarArquivo(file, opcoes = {}) {
  if (!UPLOAD_ATIVO) throw new Error("O envio permanente de arquivos ainda não está configurado.");
  // TODO (futuro): enviar para Firebase Storage / backend e devolver { id }.
  throw new Error("Não implementado.");
}
