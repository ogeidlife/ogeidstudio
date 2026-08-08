/* =========================================================
   Contador de visitas + "quem está online agora".

   Não registra IP de ninguém — só um total e uma presença
   (id aleatório por sessão, sem dado pessoal).

   Suas próprias visitas (dono do site) podem ser excluídas do
   contador: veja "Não contar minhas visitas" no painel admin,
   ou abra qualquer página do site com ?dono=1 na URL uma vez em
   cada navegador/dispositivo que você usa pra testar o site
   (fica marcado nesse navegador até você tirar com ?dono=0).

   Usa o Firebase Realtime Database (gratuito). Se a config em
   js/firebase-config.js ainda não foi preenchida, ou se algo falhar
   (sem internet, bloqueador de anúncios, Firebase fora do ar etc.),
   este script apenas desiste em silêncio — NUNCA quebra a página.
   ========================================================= */
(async function () {
  try {
    // --- ?dono=1 marca este navegador como seu (não conta mais);
    //     ?dono=0 desmarca. Fica salvo até você trocar de novo. ---
    const params = new URLSearchParams(window.location.search);
    if (params.has('dono')) {
      if (params.get('dono') === '1') localStorage.setItem('ogeid_sou_dono', '1');
      else localStorage.removeItem('ogeid_sou_dono');
    }
    if (localStorage.getItem('ogeid_sou_dono') === '1') {
      return; // é o dono testando o site — não conta como visita nem como "online"
    }

    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.databaseURL || cfg.apiKey === 'COLE_AQUI') {
      return; // Firebase ainda não configurado
    }

    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const {
      getDatabase, ref, onDisconnect, set, remove, runTransaction, serverTimestamp,
    } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js');

    const app = initializeApp(cfg);
    const db = getDatabase(app);

    // --- Conta 1 visita por sessão de navegador (não a cada página que a pessoa vê) ---
    if (!sessionStorage.getItem('ogeid_visita_contada')) {
      sessionStorage.setItem('ogeid_visita_contada', '1');
      runTransaction(ref(db, 'estatisticas/totalVisitas'), (atual) => (atual || 0) + 1).catch(() => {});
    }

    // --- Presença: marca "estou online agora" enquanto a aba estiver aberta ---
    let visitorId = sessionStorage.getItem('ogeid_visitor_id');
    if (!visitorId) {
      visitorId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
      sessionStorage.setItem('ogeid_visitor_id', visitorId);
    }

    const meRef = ref(db, `online/${visitorId}`);
    const marcarPresenca = () => set(meRef, { desde: serverTimestamp() }).catch(() => {});

    marcarPresenca();
    onDisconnect(meRef).remove().catch(() => {});

    // Renova o carimbo a cada 20s — funciona como uma rede de segurança caso o
    // onDisconnect não dispare (ex: navegador trava, perde internet de repente).
    // O admin considera "offline" qualquer registro parado há mais de 45s.
    const heartbeat = setInterval(marcarPresenca, 20000);

    window.addEventListener('pagehide', () => {
      clearInterval(heartbeat);
      remove(meRef).catch(() => {});
    });
  } catch (err) {
    // Falha silenciosa — o contador é um extra, nunca deve afetar o site.
    console.warn('Contador de visitas indisponível:', err);
  }
})();
