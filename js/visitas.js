/* js/visitas.js
   Registra as visitas do site no Firebase Realtime Database, em três
   lugares que o admin.html já sabe ler:

   - estatisticas/totalVisitas   → contador total, +1 a cada carregamento de página
   - estatisticas/entradas       → uma entrada por visita, só com o horário
                                    (sem IP, sem nenhum outro dado pessoal)
   - online/{sessionId}.desde    → marca a sessão como "ativa agora"; o admin
                                    considera "online" quem teve heartbeat
                                    nos últimos 45s

   Visitas de quem marcou "este navegador é meu" no admin (localStorage
   'ogeid_sou_dono' = '1') são ignoradas — não entram em nada disso.
*/
(async function () {
  try {
    if (localStorage.getItem('ogeid_sou_dono') === '1') return;

    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || cfg.apiKey === 'COLE_AQUI') return;

    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const {
      getDatabase, ref, runTransaction, push, set, remove,
      onDisconnect, serverTimestamp
    } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js');

    const app = initializeApp(cfg);
    const db = getDatabase(app);

    // total de visitas — soma 1 a cada vez que essa página carrega
    runTransaction(ref(db, 'estatisticas/totalVisitas'), (atual) => (atual || 0) + 1);

    // horário desta visita, pro admin mostrar em "Horários de entrada"
    push(ref(db, 'estatisticas/entradas'), { horario: serverTimestamp() });

    // sessão "online agora" — um id por aba/sessão do navegador
    let sessionId = sessionStorage.getItem('ogeid_session_id');
    if (!sessionId) {
      sessionId = 'v' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem('ogeid_session_id', sessionId);
    }
    const onlineRef = ref(db, 'online/' + sessionId);
    set(onlineRef, { desde: serverTimestamp() });
    onDisconnect(onlineRef).remove();

    // heartbeat: renova "desde" a cada 20s pra sessão continuar contando
    // como online enquanto a aba estiver aberta
    const heartbeat = setInterval(() => {
      set(onlineRef, { desde: serverTimestamp() });
    }, 20000);

    window.addEventListener('beforeunload', () => {
      clearInterval(heartbeat);
      remove(onlineRef);
    });
  } catch (err) {
    // silencioso de propósito — estatísticas nunca podem quebrar o site
  }
})();
