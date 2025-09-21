(function () {
  const tg = window.Telegram?.WebApp;
  const params = new URLSearchParams(location.search);
  const nonce = params.get('n') || '';
  const $ = (id) => document.getElementById(id);

  if (!tg) {
    $('fallback').classList.remove('hidden');
    $('form').classList.add('hidden');
  } else {
    tg.ready();
    tg.expand();
  }

  function updateUsername(){
    const first = $('first_name').value.trim();
    const last  = $('last_name').value.trim();
    const joiner = ' ';
    $('username').value = `${first}${first&&last?joiner:''}${last}`.trim();
  }
  $('first_name').addEventListener('input', updateUsername);
  $('last_name').addEventListener('input', updateUsername);
  $('nonce').value = nonce;

  function isEmail(v){ return !v || /[^@\s]+@[^@\s]+\.[^@\s]+/.test(v); }
  function isPhone(v){ return !v || /^[+]?\d[\d\s\-()]{7,}$/.test(v); }

  // Обработчик отправки формы (submit), не inline
  $('form').addEventListener('submit', (e) => {
    e.preventDefault(); // из-за CSP form-action 'none'
    if (!tg) return alert('Откройте форму из Telegram-бота.');

    const data = {
      nonce: $('nonce').value,
      first_name: $('first_name').value.trim(), // фамилия
      last_name:  $('last_name').value.trim(),  // имя
      phone:      $('phone').value.trim(),
      email:      $('email').value.trim(),
      username:   $('username').value.trim(),
    };

    if (!data.first_name || !data.last_name) return tg.showAlert('Заполните фамилию и имя');
    if (!isEmail(data.email)) return tg.showAlert('Некорректный email');
    if (!isPhone(data.phone)) return tg.showAlert('Некорректный телефон');

    // Диагностика: покажем, что код дошёл сюда
    // tg.showAlert('▶️ Отправляю в бота...');

    tg.sendData(JSON.stringify(data));

    // Можно закрыть сразу; на время диагностики закомментируй
    tg.close();
  });
})();
