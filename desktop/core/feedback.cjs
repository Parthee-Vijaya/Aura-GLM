// Testerne sender feedback på e-mail til den, der står for testen. Kontakten står i package.json under "feedback", så den
// kan skiftes for hver testrunde. Appen sender intet selv: e-mailprogrammet åbner en kladde med appversion og styresystem,
// og adressen står synligt i appen, så den kan kopieres, hvis computeren ikke har et e-mailprogram.
// Kun almindelige adresser. Tegn som ? og & kunne ellers tilføje modtagere eller felter til e-mailen.
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function contact(settings = require('../package.json').feedback) {
  const name = typeof settings?.name === 'string' ? settings.name.trim() : '';
  const email = typeof settings?.email === 'string' ? settings.email.trim() : '';
  return name && EMAIL.test(email) ? { name, email } : null;
}

function mail(person, { version, system }) {
  const subject = `Feedback om Aura ${version}`;
  const body = `Hvad forsøgte du at gøre?\n\n\nHvor gik du i stå, eller hvad savnede du?\n\n\n(Aura ${version} · ${system}. Send ikke API-nøgler eller arbejdspladsens data.)`;
  return `mailto:${person.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

module.exports = { contact, mail };
