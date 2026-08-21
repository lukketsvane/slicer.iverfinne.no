# slicerman.iverfinne.no

Ein reiskap som tek eit tredimensjonalt nett og gjev deg **flate delar du
kan skjere ut** på laser eller CNC — og som held seg sjølve saman når du set
dei i hop. Dra inn ei STL, sett platetjukna, last ned DXF-en.

Ingen lisens, ingen installasjon, ingen krunglete Blender-vev.

## Kva han gjer

Éin typologi står ferdig: **VAFFEL** — kryssholdte ribber i to retningar.
X-ribbene har spor opne oppover, Y-ribbene spor opne nedover, og då kan du
leggje X-familien på bordet og senke Y-familien ned i han. Det er heile
monteringa. Det finst ikkje ein skrue og ikkje ein dråpe lim i eit ferdig
uttak.

Standardobjektet er ein kube. Ikkje av di kuben er interessant, men av di
han er det einaste objektet som ikkje gøymer noko: seks ribber kvar veg,
seks og tretti ledd, alle like, alle synlege. Ser du at kuben held seg
sjølv oppe, veit du kva reiskapen gjer før du har lasta opp noko som helst.

## Dei tre lesemåtane

Same objekt, tre visingar, same geometri:

| | |
|---|---|
| **flate** | nettet slik det kom inn, etter forenkling og glatting |
| **lag** | ribbene slik dei faktisk står, med spor. Dette ER objektet |
| **kontur** | dei flate kuttprofilane, slik dei ligg på plata |

## Vegen frå fil til del

```
STL / OBJ / PLY
   │
   ├── SVEIS       lause trekantar vert hjørne med naboar
   ├── FORENKL     hjørneklynging ned til det taket skyvaren set
   ├── GLATT       Taubin — ruglet går, volumet står
   ├── PLASSER     vend, skaler, sentrer, sett på golvet
   │
   ├── STRÅLAR     kva er inne og kva er ute?
   ├── RIBBER      plansnitt gjennom kroppen, med spor der dei kryssar
   │
   └── STL · DXF · SVG · ARK
```

Nettet er ei skalvegg og ikkje ein kropp. Reiskapen gjer det om til ein
kropp med strålar: skyt ein stråle langs ein akse og tel kva veg kvar
trekant han råkar vender — ein som vender MOT strålen er ein veg inn, ein
som vender med han er ein veg ut. Summen undervegs er kor mange skal du
står inne i, og alt over null er material.

Summen, og ikkje paritet. Eit skann har ofte to skal oppå kvarandre, eller
ein hatt som stikk inn i eit hovud. Paritet les overlappet som LUFT — eit
hòl midt i objektet der to skal kryssar. Summen les det som det er.

## Reglane

Det som skil ein reiskap frå ein demonstrasjon, er om han seier nei.
Reiskapen snittar kva som helst, men han seier frå og han seier kvifor:

- ribbene må gripe i kvarandre
- kvar del må henge i minst eitt ledd — elles er ho ei laus plate i eska
- sporet må vera breiare enn fresen, elles kjem verktøyet ikkje ned i det
- det må vera gods att i leddet når sporet har ete halve overlappet
- delane må få plass på den plata du faktisk har

Harde reglar tyder at delane ikkje kan lagast eller ikkje kan monterast.
Mjuke er val som skal stå på papiret i staden for i hovudet.

## Nestinga

Delane vert lagde ut etter KONTUREN og ikkje etter den omsluttande boksen.
Skilnaden er ikkje liten: ei ribbe frå eit krumt objekt er ei tunge eller
ein boge, og boksen kring henne er mest luft. Tel du boksar, kjøper du to
plater der du trong ei.

Kvar del vert rasterisert til eit rutenett, og HÒLA i han er ledig plass —
so ein mindre del kan liggje inne i opninga på ein større. Så vert delen
dytta ned og til venstre til han stoggar mot noko. Det er den same
grunnalgoritmen som ligg under svgnest; skilnaden er at svgnest legg ein
genetisk algoritme oppå og prøver tusen rekkjefylgjer. Det er betre, og det
tek minutt. Denne køyrer éin gong, deterministisk, på nokre titals
millisekund — og han må det, av di talet på plater står i panelet og skal
fylgje skyvaren medan du dreg i han.

Klaringa ligg i rasteret og ikkje i søket: kvar del vert utvida med halve
luka på alle kantar før han vert lagd. Oppløysinga vert vald av luka, so
klaringa ikkje kan kvantiserast bort.

## Merkinga

Kvar del får adressa si gravert: `X3` er tredje ribba langs X, `Y7a` er
fyrste stykket av sjuande ribba langs Y. Det er dét som fortel deg kvar
delen høyrer heime når du har seksti like plater på bordet.

Bokstavane er **polyliner og ikkje tekst**. Ein TEXT-entitet i ein DXF og
eit `<text>` i ein SVG er begge eit spørsmål til maskina om ho tilfeldigvis
har den skrifta, og svaret er ofte nei: laserpanelet hoppar over teksten,
eller det brenn eit fylt svart felt der det skulle stått eit tal. Ein strek
kan ingen maskin misforstå. Adressa ligg der det er mest gods — største
innskrivne kvadrat, ikkje tyngdepunktet, av di tyngdepunktet til ein boge
ligg i lause lufta under han.

I SVG-ane er fargen laget:

| | |
|---|---|
| svart | KUTT — heilt gjennom |
| blått | GRAVER — adressa, ein strek og ikkje eit fylt felt |
| grått | berre til opplysning: plateomrisset og overskrifta |

Ingenting er fylt. I DXF-en er det ekte lag: `KUTT` og `GRAVER`.

## Ledda

Sporet er halve overlappet, og djupna er difor ikkje eit tal du set — ho
fylgjer av geometrien. Det einaste som er eit val, er kvar i overlappet
delinga ligg, og kva form innerhjørna får:

| | |
|---|---|
| **rett** | skarpe hjørne. Rett på laser, umogleg på fres |
| **hundebein** | eit hòl på diagonalen ut frå hjørnet — kortaste vegen ut |
| **t-bein** | eit hòl på sjølve sporveggen. Sporbotnen står flat |

Spora står i FELTET og ikkje i polygonet etterpå. Det er ikkje ein snarveg
forbi ein boolsk operasjon — det er den einaste måten kuttfila og nettet
ikkje kan kome i utakt på. Ein fres som fylgjer denne konturen skjer
nøyaktig den ribba biletet viser, spor, hundebein og alt.

## Kva som ligg kvar

| fil | kva |
|---|---|
| `lib/core.ts` | **start her.** Kontrakten: parameterband, måltal, reglar, lesemåtar |
| `lib/soup.ts` | nettet i to former, og vegen mellom dei: sveis, skyggjing, plassering |
| `lib/io/` | STL, OBJ og PLY inn |
| `lib/mesh/simplify.ts` | hjørneklynging — to millionar trekantar ned til tjue tusen |
| `lib/mesh/smooth.ts` | Taubin: lågpass som ikkje krympar |
| `lib/mesh/solid.ts` | strålane. Nettet som ein kropp du kan spørje |
| `lib/contour.ts` | marsjerande rute: nullstaden i eit felt, som lukka polygon |
| `lib/pack.ts` | nestinga: raster, bottom-left-fill, hòl som ledig plass |
| `lib/stroke.ts` | éin-strøks skrift, so eit gravert nummer er geometri |
| `lib/vaffel/` | kroppen, ribbene, ledda, delane, nestinga, måltala, reglane, filene |
| `lib/worker.ts` | motoren i eigen tråd; hovudtråden teiknar og gjer ikkje anna |
| `components/` | scena, gestane, panelet |

## Køyre

```bash
pnpm install
pnpm dev
```

Bygg med `pnpm build`. Det tvingar webpack, og ei vakt nektar å sleppe
gjennom eit bygg der arbeidaren ligg som rå TypeScript i `static/media` —
det er kva Turbopack gjer med `new Worker(new URL(…))`, og arbeidaren døyr
då lydlaust i nettlesaren.

## Prøve

```bash
pnpm probe   # motoren utan nettlesar: delar, ledd, kuttlengd, filer
pnpm pakk    # teiknar kvar plate opp att og tel celler: ligg to delar oppå
             # kvarandre, eller utanfor plata, seier han frå
pnpm tung    # ein million trekantar inn, og kor lang tid det tek
pnpm ark     # kuttarka som bilete, so ein kan sjå at nummera hamna på gods
pnpm look    # bilete av sida, og alle konsollfeil som eventuelt står der
```

## Kva som er lånt

Scena, gestane, det flytande panelet og den delbare URL-en kjem frå
[50x50x50.iverfinne.no](https://50x50x50.iverfinne.no) — same lysrigg, same
tre-fingers lysstyring, same prinsipp om at eit design er eit punkt i eit
parameterrom og at hashen kodar punktet nøyaktig. Vaffelmotoren deler tanke
med han, men ikkje geometri: der bygde han eit sitjemøbel av ei likning ein
kunne skrive ned, her byggjer han av eit nett ingen veit forma på.

Det er heile skilnaden, og han går djupt. Ei likning kan du spørje kvar som
helst. Eit nett må du skyte på.
