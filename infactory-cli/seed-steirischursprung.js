#!/usr/bin/env node
/**
 * seed-steirischursprung.js — Erstellt Pages + Featured Posts auf Ghost
 *
 * Usage:
 *   INFACTORY_GHOST_URL=https://dev.steirischursprung.at \
 *   INFACTORY_GHOST_KEY=$(cat /tmp/.dev.ghost_key) \
 *   node seed-steirischursprung.js
 */
'use strict';

const { createPage, createPost } = require('./src/ghost-api');

const GHOST_URL = process.env.INFACTORY_GHOST_URL;
const GHOST_KEY = process.env.INFACTORY_GHOST_KEY;

if (!GHOST_URL || !GHOST_KEY) {
  console.error('INFACTORY_GHOST_URL und INFACTORY_GHOST_KEY müssen gesetzt sein.');
  process.exit(1);
}

const ARV = 'https://arv.steirischursprung.at/wp-content/uploads';

// ─── Pages ──────────────────────────────────────────────────────────────────

const pages = [
  {
    title: 'Hotel',
    slug: 'hotel',
    status: 'published',
    feature_image: `${ARV}/2016/09/hotel-header_01.jpg`,
    custom_excerpt: 'Das Hotel Steirisch Ursprung vereint die Quintessenz des Steirischen mit einer Extraportion Wahnsinn.',
    meta_title: 'Hotel — Steirisch Ursprung',
    meta_description: 'Erlebnishotel Steirisch Ursprung in Brodersdorf — Österreichs schrägstes Hotel.',
    tags: [{ name: '#feature-card' }],
    html: `
<h2>Erlebnishotel "Steirisch Ursprung"</h2>
<p>Das Hotel Steirisch Ursprung vereint die Quintessenz des Steirischen mit einer Extraportion Wahnsinn.</p>
<p>Was ist Steiermark wirklich? Wie kann man die Vielfalt dieser schönen und einzigartigen Steiermark am besten beschreiben?</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/steirisch-box1.jpg" alt="Erlebnishotel Steirisch Ursprung" /></figure>

<h2>Angebote &amp; Packages</h2>
<p>Mit unseren einzigartigen Angeboten &amp; Packages erlebst du außergewöhnliche Tage, an die du dich ewig erinnern wirst...</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/steirisch-box3.jpg" alt="Angebote und Packages" /></figure>

<h2>Ursprung Wellness</h2>
<p>Erholung pur bieten unsere entspannenden Bierbäder, Massagen mit edlem Bienenhonig und vieles mehr.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/box-wellness.jpg" alt="Ursprung Wellness Bierbad" /></figure>

<h2>Unsere Zimmer &amp; Preise</h2>
<p>Die einzelnen Zimmer sind auf verschiedene Themen aus dem traditionellen ländlichen Leben ausgerichtet.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/SteirischUrsprung_G.jpg" alt="Zimmer Steirisch Ursprung" /></figure>

<h2>Ursprung Erkundungstour</h2>
<p>Mit Wanderstock und Jausenpinkerl begeben wir uns zu den Bauern in der Umgebung und erleben, wie Lebensmittel entstehen.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/tour-box.jpg" alt="Ursprung Erkundungstour" /></figure>

<h2>Steirisch Ursprung Dorf</h2>
<p>Einmal Leben wie ein König in der Steiermark! Erleben Sie den Komfort der Adeligen vor 150 Jahren in unserem Brandhof.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/steirisch-box2.jpg" alt="Steirisch Ursprung Dorf" /></figure>
`,
  },

  {
    title: 'Feiern & Genießen',
    slug: 'feiern-geniessen',
    status: 'published',
    feature_image: `${ARV}/2016/09/shutterstock_91766336-web.jpg`,
    custom_excerpt: 'Bei Steirisch Ursprung feiern wir gern steirische Feste mit Volksmusik, Speis und Trank und natürlich einer Riesengaude.',
    meta_title: 'Feiern & Genießen — Steirisch Ursprung',
    meta_description: 'Feiern bei Steirisch Ursprung — Veranstaltungssäle, Hochzeiten, Seminare in der Steiermark.',
    tags: [{ name: '#feature-card' }],
    html: `
<h2>Feiern bei "Steirisch Ursprung" — eine Riesengaude</h2>
<p>Bei "Steirisch Ursprung" feiern wir gern steirische Feste mit Volksmusik, Speis und Trank und natürlich einer "Riesengaude".</p>
<p>Auch wenn die Feierlichkeiten nicht immer ursprünglich begründet sind, so finden wir doch immer Wege um sie an unsere urige Gemütlichkeit anzupassen.</p>
<p>Wir freuen uns auf Sie! Für eine persönliche Beratung stehen wir gerne unter +43 3117 51 71 zur Verfügung!</p>

<h2>Das Bier aus dem Heustadl</h2>
<p>Seit 1997 wird beim Neuwirth in der Gemeinde Brodingberg Bier gebraut. Anfangs war es lediglich Honigbier, ein mildes, leicht süßliches, vollmundiges Bier, das in der Region unter dem Namen "Sauschneider" bekannt wurde.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/biene-bier-spiegelung_1.png" alt="Biene mit Bier" /></figure>

<h2>Für jeden Anlass den richtigen Saal</h2>
<p>Wir bieten Ihnen und Ihren Gästen ein unvergleichliches Ambiente für Augenblicke, die unvergesslich bleiben sollen.</p>
<p>Egal ob Seminare, Geburtstags- und Weihnachtsfeiern, Polterabende, Tauf-, Erstkommunions-, Firmungs- oder Hochzeitsfeierlichkeiten — besonders auch für Busreisegruppen sind wir bestens ausgerüstet.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/wildschwein-zubereitet-spiegelung.png" alt="Steirische Küche" /></figure>

<h2>Hochzeiten auf Steirisch Ursprung</h2>
<p>Auf den Spuren von Erzherzog Johann schließen Sie den Bund der Ehe in unserer Trauungskapelle zur Heiligen Faustina, stoßen in der Braustube mit selbstgebrautem Sonnenbier an und genießen steirische Schmankerln auf der festlichen Hochzeitstafel im Wabensaal.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/vogerl-in-love.png" alt="Hochzeiten" /></figure>

<h2>Unsere Veranstaltungssäle</h2>
<h3>Kristallzimmer — 25-35 Personen</h3>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/kristallzimmer_1-1024x683.jpg" alt="Kristallzimmer" /></figure>

<h3>Wabensaal — bis 55 Personen</h3>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/wabensaal-1024x683.jpg" alt="Wabensaal" /></figure>

<h3>Heustadl — bis 50 Personen</h3>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/heustadl-1024x683.jpg" alt="Heustadl" /></figure>

<h3>Bienenstock — bis 36 Personen</h3>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/SteirischUrsprung_Bienenstock-1024x550.jpg" alt="Bienenstock" /></figure>

<h3>Braustube — bis 55 Personen</h3>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/09/SteirischUrsprung_E-1024x942.jpg" alt="Braustube" /></figure>
`,
  },

  {
    title: 'Bienenstock',
    slug: 'bienenstock',
    status: 'published',
    feature_image: `${ARV}/2016/10/bienenstock_header.jpg`,
    custom_excerpt: 'Perfekt für Seminare und Veranstaltungen — dieser einzigartige Raum bietet für bis zu 36 Personen die besten Voraussetzungen.',
    meta_title: 'Bienenstock — Steirisch Ursprung',
    meta_description: 'Der Bienenstock — einzigartiger Seminar- und Veranstaltungsraum für bis zu 36 Personen.',
    tags: [],
    html: `
<h2>Perfekt für Seminare und Veranstaltungen</h2>
<p>Du wolltest schon immer mal ein Seminar der besonderen Art haben? Dieser einzigartige Raum bietet dafür die besten Voraussetzungen!</p>
<figure class="kg-card kg-image-card kg-width-wide"><img src="${ARV}/2016/10/SteirischUrsprung_Bienenstock.jpg" alt="Bienenstock Außenansicht" /></figure>

<p>Bei einer Multimedia-Vorführung erfährst du, wie unsere Produkte deinen Geist verzaubern. In dieser Atmosphäre lässt sich auch sehr gut arbeiten.</p>
<p>Unter der Kuppel des Bienenstocks ist deshalb ein moderner Seminarraum für bis zu 36 Personen eingerichtet.</p>

<figure class="kg-card kg-image-card kg-width-wide"><img src="${ARV}/2016/10/bienenstock-innen_2.jpg" alt="Bienenstock Innenansicht Seminarraum" /></figure>

<p>Etwas ganz Besonderes im Bienenstock ist nicht nur die Emsigkeit der Bienen, die die Seminarteilnehmerinnen und -teilnehmer gleich ansteckt, sondern auch der einzigartige Massivholzboden aus heimischen Hölzern, der mit verschiedensten Ornamenten und Symbolen liebevoll verziert worden ist.</p>

<h3>Technische Ausstattung</h3>
<ul>
<li>Tonanlage mit Funkmikro</li>
<li>Beamer</li>
<li>WLAN</li>
</ul>

<h2>Feiern im Bienenstock</h2>
<p>Im Bienenstock lässt sich aber auch wunderbar feiern. Dieser einzigartige und liebevoll gestaltete Bereich bietet Platz für bis zu 36 Gäste, die alle über diesen außergewöhnlichen Saal staunen werden.</p>
<p>Ob Seminare, Geburtstags- und Weihnachtsfeiern, Polterabende, Tauf-, Erstkommunions-, Firmungs- oder Hochzeitsfeiern — hier ist genug Platz für jeden Anlass.</p>

<h2>Jetzt anfragen</h2>
<p>Für eine persönliche Beratung stehen wir gerne unter <strong>+43 3117 51 71</strong> zur Verfügung!</p>
`,
  },

  {
    title: 'Brauerei',
    slug: 'brauerei',
    status: 'published',
    feature_image: `${ARV}/2016/09/Hotel_7-2400px.jpg`,
    custom_excerpt: 'Seit 1997 braut Walter Neuwirth in Brodingberg Sonnenbier — mit Honig, Kürbis und der Kraft der Sonne.',
    meta_title: 'Brauerei — Steirisch Ursprung',
    meta_description: 'Solarbrauerei Steirisch Ursprung — Honigbier, Kürbisbier und Weizenbier aus der Steiermark.',
    tags: [{ name: '#feature-card' }],
    html: `
<h2>So kam ich zum Bierbrauen ...</h2>
<p>Weil ich 1997 zu viel Blütenhonig hatte und den Honig nicht verkaufen konnte, musste ich mir etwas einfallen lassen, wie ich den Honig an Mann &amp; Frau bringen konnte.</p>
<p>Da fiel mir ein alkoholisches Getränk ein, das sogenannte Sauschneider Bier, welches man früher bei Kirtagen und Festen zu trinken bekam und eine Mischung aus Bier und Honigwein darstellt.</p>

<h3>Bier aus Honig</h3>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/biene-honigloeffel-1.png" alt="Biene mit Honiglöffel" /></figure>

<h3>Fruchtig &amp; leicht</h3>
<p>Das fruchtige, mit leichtem Abgang von Kürbiskernen und wenig Hopfen gebraute Kürbisbier ist ein Geschmackserlebnis der besonderen Art. Die Stammwürze des Getränks liegt bei 12,5 Vol %.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/biene-bier_1.png" alt="Biene mit Bier" /></figure>

<h3>Besonderer Durstlöscher</h3>
<p>Das Weizenbier ist ein frisches, geschmacksintensives obergähriges Weißbier, das im Abgang fruchtig nach Bananen schmeckt. Gerade im Sommer ein besonderer Durstlöscher.</p>

<h2>Unsere Solarbrauerei</h2>
<h3>Energiequelle Sonne</h3>
<p>Gerade das sehr hohe Temperaturniveau von ca. 100°C, welches bei jedem Brauvorgang benötigt wird, und die komplexe Anlage, war Anlass, sich an die Spezialisten der AEE-INTEC zu wenden.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/bier-ziege.png" alt="Bier Ziege Illustration" /></figure>

<h3>Der erste Schritt</h3>
<p>Mit einem speziell neu entwickelten Flachkollektor ist es möglich, Temperaturen von 100°C und mehr mit einem sehr hohen Ausnutzungsgrad der Sonne zu erreichen.</p>
<p>Die insgesamt 20 m² Kollektorfläche speisen mittels Vorrangschaltung einen 850 Liter fassenden Pufferspeicher. Aus diesem wird die Energie für den gesamten Brauprozess geliefert.</p>

<h3>Wetterunabhängig</h3>
<p>Falls die Sonne auch in Brodersdorf einmal nicht scheint, wird die benötigte Energie elektrisch erzeugt oder mit einem Stückholzkessel nachgeheizt.</p>
<figure class="kg-card kg-image-card"><img src="${ARV}/2016/10/biene-bierbard.png" alt="Biene Bierbad" /></figure>
`,
  },
];

// ─── Featured Posts (für Hero Slider) ───────────────────────────────────────

const featuredPosts = [
  {
    title: 'Österreichs schrägstes Hotel',
    slug: 'oesterreichs-schraegstes-hotel',
    status: 'published',
    featured: true,
    feature_image: `${ARV}/2016/09/Hotel_A.jpg`,
    custom_excerpt: 'Von Sonne gebrautes Bier trinken, im Biersud baden, den wahren Steirisch Ursprung genießen.',
    tags: [{ name: 'Hotel' }],
    html: '<p>Von Sonne gebrautes Bier trinken, im Biersud baden, den wahren Steirisch Ursprung genießen. Begib dich auf eine Zeitreise durch die Steiermark und erlebe Einzigartiges!</p>',
  },
  {
    title: 'Erleben & Staunen',
    slug: 'erleben-und-staunen',
    status: 'published',
    featured: true,
    feature_image: `${ARV}/2016/09/SteirischUrsprung_Bienenstock.jpg`,
    custom_excerpt: 'Der Bienenstock — ein einzigartiger Ort für Seminare, Feiern und unvergessliche Momente.',
    tags: [{ name: 'Erlebnis' }],
    html: '<p>Der Bienenstock — ein einzigartiger Ort für Seminare, Feiern und unvergessliche Momente in der Steiermark.</p>',
  },
  {
    title: 'Gasthaus & Kulinarik',
    slug: 'gasthaus-und-kulinarik',
    status: 'published',
    featured: true,
    feature_image: `${ARV}/2016/09/shutterstock_91766336-web.jpg`,
    custom_excerpt: 'Ursprüngliche Gerichte mit der einzigartigen Note unserer Region.',
    tags: [{ name: 'Gasthaus' }],
    html: '<p>Genieße gute steirische Küche — ursprüngliche Gerichte mit der einzigartigen Note unserer Region.</p>',
  },
  {
    title: 'Feiern & Hochzeiten',
    slug: 'feiern-und-hochzeiten',
    status: 'published',
    featured: true,
    feature_image: `${ARV}/2016/10/slider-hochzeit-steirisch-ursprung-1.jpg`,
    custom_excerpt: 'Erlebt einen Tag, den ihr nie vergessen werdet!',
    tags: [{ name: 'Feiern' }],
    html: '<p>Auf den Spuren von Erzherzog Johann schließen Sie den Bund der Ehe in unserer Trauungskapelle zur Heiligen Faustina.</p>',
  },
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🏭 inFactory Seed — Steirisch Ursprung\n');
  console.log(`   Ghost: ${GHOST_URL}\n`);

  // Pages erstellen
  console.log('── Pages ──────────────────────────────────');
  for (const page of pages) {
    try {
      const result = await createPage(GHOST_URL, GHOST_KEY, page);
      console.log(`     ✔ ${result.title} → ${result.url}`);
    } catch (e) {
      console.error(`     ✗ ${page.title}: ${e.message.substring(0, 200)}`);
    }
  }

  // Featured Posts erstellen
  console.log('\n── Featured Posts (Hero Slider) ────────────');
  for (const post of featuredPosts) {
    try {
      const result = await createPost(GHOST_URL, GHOST_KEY, post);
      console.log(`     ✔ ${result.title} → ${result.url} (featured: ${result.featured})`);
    } catch (e) {
      console.error(`     ✗ ${post.title}: ${e.message.substring(0, 200)}`);
    }
  }

  console.log('\n✅ Seed abgeschlossen.\n');
  console.log('   Nächste Schritte:');
  console.log(`   → ${GHOST_URL} prüfen`);
  console.log(`   → ${GHOST_URL}/ghost/#/pages → Pages prüfen`);
  console.log(`   → ${GHOST_URL}/ghost/#/posts → Featured Posts prüfen\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
