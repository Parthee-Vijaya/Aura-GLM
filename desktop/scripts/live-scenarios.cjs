const assert = require('node:assert/strict');
const scenarios = {
  rooms: {
    name: 'Mødelokaler',
    idea: 'En oversigt over tre fiktive mødelokaler med navn, kapacitet, sted og udstyr. Brugeren kan filtrere på mindst antal pladser. Brug en label med teksten Mindst antal pladser til et numerisk input, der straks filtrerer. Vis en forståelig tom tilstand, når ingen lokaler matcher.',
    async check(frame) { const filter=frame.getByRole('spinbutton',{name:/antal pladser/i}); await filter.fill('9999'); const empty=await frame.locator('body').innerText(); assert.match(empty,/ingen|ikke fundet|ikke nogen/i); await filter.fill('0'); assert.notEqual(await frame.locator('body').innerText(),empty); },
    refinement: 'Tilføj knappen Nulstil filter. Den skal sætte Mindst antal pladser til 0 og vise alle lokaler igen. Bevar resten af siden og dens design.',
    async checkRefinement(frame) { await frame.getByRole('spinbutton',{name:/antal pladser/i}).fill('9999'); await frame.getByRole('button',{name:'Nulstil filter',exact:true}).click(); assert.equal(await frame.getByRole('spinbutton',{name:/antal pladser/i}).inputValue(),'0'); }
  },
  tasks: {
    name: 'Dagens opgaver',
    idea: 'En lille opgaveliste til et fiktivt bibliotek. Man skal kunne skrive en opgave i et felt med label Ny opgave og trykke Tilføj opgave. Hver opgave har et afkrydsningsfelt med opgavens tekst som tilgængeligt navn. Vis tre opdigtede opgaver fra starten. Brug kun data i hukommelsen og fortæl, at siden er en demonstration.',
    async check(frame) { await frame.getByRole('textbox',{name:'Ny opgave',exact:true}).fill('Bestil kaffe'); await frame.getByRole('button',{name:'Tilføj opgave',exact:true}).click(); await frame.getByRole('checkbox',{name:'Bestil kaffe',exact:true}).check(); assert.equal(await frame.getByRole('checkbox',{name:'Bestil kaffe',exact:true}).isChecked(),true); },
    refinement: 'Tilføj knappen Ryd afsluttede. Den skal fjerne afsluttede opgaver og bevare de øvrige. Bevar designet og den eksisterende mulighed for at tilføje opgaver.',
    async checkRefinement(frame) { await scenarios.tasks.check(frame); await frame.getByRole('button',{name:'Ryd afsluttede',exact:true}).click(); assert.equal(await frame.getByRole('checkbox',{name:'Bestil kaffe',exact:true}).count(),0); assert.ok(await frame.getByRole('checkbox').count()>0); }
  },
  activities: {
    name: 'Det sker i fælleshuset',
    idea: 'En kalenderoversigt med tre fiktive aktiviteter, datoer og korte beskrivelser. En af dem hedder Fællesspisning. Et tekstfelt med label Søg aktiviteter filtrerer straks på aktivitetens navn. En søgning uden match viser en forståelig tom tilstand. Der skal være tydelig forskel på navn, dato og beskrivelse, også på mobil.',
    async check(frame) { const field=frame.getByRole('textbox',{name:'Søg aktiviteter',exact:true}); await field.fill('zzzzfindesikke'); assert.match(await frame.locator('body').innerText(),/ingen|ikke fundet|ikke nogen/i); await field.fill('Fællesspisning'); assert.match(await frame.locator('body').innerText(),/Fællesspisning/); await field.fill(''); },
    refinement: 'Tilføj knappen Ryd søgning. Den skal tømme søgefeltet og vise alle aktiviteter igen. Bevar resten af siden.',
    async checkRefinement(frame) { await frame.getByRole('textbox',{name:'Søg aktiviteter',exact:true}).fill('zzzzfindesikke'); await frame.getByRole('button',{name:'Ryd søgning',exact:true}).click(); assert.equal(await frame.getByRole('textbox',{name:'Søg aktiviteter',exact:true}).inputValue(),''); assert.match(await frame.locator('body').innerText(),/Fællesspisning/); }
  }
};
module.exports = { scenarios };
