/* js/visitas.js
   Registra as visitas do site no Firebase Realtime Database, em lugares
   que o admin.html já sabe ler:

   - estatisticas/totalVisitas   → contador total, +1 uma vez por sessão de
                                    navegação (não uma vez por página — clicar
                                    em várias páginas na mesma visita conta
                                    como 1 só, até fechar a aba)
   - estatisticas/entradas       → uma entrada por visita, só com o horário
                                    (sem IP, sem nenhum outro dado pessoal)
   - estatisticas/porMes/AAAA-MM → contador de visitas por mês, +1 uma vez
                                    por sessão (mesma regra do total, só que
                                    separado por mês — alimenta o gráfico
                                    "Visitantes por mês" no admin)
   - estatisticas/cliques/{key}  → contador de quantas vezes a página de
                                    cada peça (produto.html?key=...) foi
                                    aberta — alimenta a "Peça mais clicada"
                                    no admin. Conta a cada abertura (não só
                                    uma vez por sessão), pra refletir o
                                    interesse real na peça.
   - online/{sessionId}.desde    → marca a sessão como "ativa agora"; o admin
                                    considera "online" quem teve heartbeat
                                    nos últimos 45s. Esse SIM é atualizado em
                                    toda página, pra "online agora" continuar
                                    certo enquanto a pessoa navega pelo site.

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

    // sessão desta visita — um id por aba/sessão do navegador, usado tanto
    // pra "online agora" quanto pra saber se já contamos essa visita
    let sessionId = sessionStorage.getItem('ogeid_session_id');
    if (!sessionId) {
      sessionId = 'v' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      sessionStorage.setItem('ogeid_session_id', sessionId);
    }

    // total de visitas + horário de entrada + contador do mês — só na
    // PRIMEIRA página vista nesta sessão (sessionStorage dura até a aba
    // fechar, sobrevive a navegação entre páginas do site)
    if (!sessionStorage.getItem('ogeid_visita_contada')) {
      sessionStorage.setItem('ogeid_visita_contada', '1');

      runTransaction(ref(db, 'estatisticas/totalVisitas'), (atual) => (atual || 0) + 1)
        .catch((err) => console.warn('[visitas] não consegui gravar totalVisitas:', err.message));

      push(ref(db, 'estatisticas/entradas'), { horario: serverTimestamp() })
        .catch((err) => console.warn('[visitas] não consegui gravar entradas (verifique as regras do Firebase para este caminho):', err.message));

      const agora = new Date();
      const chaveMes = agora.getFullYear() + '-' + String(agora.getMonth() + 1).padStart(2, '0');
      runTransaction(ref(db, 'estatisticas/porMes/' + chaveMes), (atual) => (atual || 0) + 1)
        .catch((err) => console.warn('[visitas] não consegui gravar porMes:', err.message));
    }

    // peça mais clicada — se esta página é produto.html?key=..., soma +1
    // no contador daquela peça específica
    const params = new URLSearchParams(window.location.search);
    const produtoKey = params.get('key');
    if (produtoKey && /produto\.html$/i.test(window.location.pathname)) {
      runTransaction(ref(db, 'estatisticas/cliques/' + produtoKey), (atual) => (atual || 0) + 1)
        .catch((err) => console.warn('[visitas] não consegui gravar cliques:', err.message));
    }

    // "online agora" — atualizado em toda página, continua contando
    // enquanto a pessoa navega pelo site
    const onlineRef = ref(db, 'online/' + sessionId);
    set(onlineRef, { desde: serverTimestamp() })
      .catch((err) => console.warn('[visitas] não consegui gravar online:', err.message));
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
    console.warn('[visitas] erro ao inicializar estatísticas:', err);
  }
})();
