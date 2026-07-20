/**
 * Catálogo curado de feeds sugeridos, agrupados por tema.
 * `folderLabel` decide en qué carpeta cae al agregarlo (se crea si no existe).
 */
export interface SuggestedFeed {
  title: string;
  url: string;
  folderLabel: string;
  note: string;
}

export const SUGGESTED_CATALOG: SuggestedFeed[] = [
  // IA / ML
  { title: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', folderLabel: 'IA', note: 'Modelos abiertos, papers aplicados' },
  { title: 'Google DeepMind', url: 'https://deepmind.google/blog/feed/basic/', folderLabel: 'IA', note: 'Investigación de frontera' },
  { title: 'BAIR (Berkeley AI)', url: 'https://bair.berkeley.edu/blog/feed.xml', folderLabel: 'IA', note: 'Academia, a fondo' },
  { title: 'MIT News · IA', url: 'https://news.mit.edu/topic/mitartificial-intelligence2-rss.xml', folderLabel: 'IA', note: 'Divulgación seria' },

  // Desarrollo / stack
  { title: 'Vercel', url: 'https://vercel.com/atom', folderLabel: 'Desarrollo', note: 'Creadores de Next.js' },
  { title: 'React Blog', url: 'https://react.dev/rss.xml', folderLabel: 'Desarrollo', note: 'Oficial de React' },
  { title: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', folderLabel: 'Desarrollo', note: 'Front-end, CSS' },
  { title: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', folderLabel: 'Desarrollo', note: 'UX y front-end' },
  { title: 'MongoDB Blog', url: 'https://www.mongodb.com/blog/rss', folderLabel: 'Desarrollo', note: 'Bases NoSQL' },
  { title: 'Josh Comeau', url: 'https://www.joshwcomeau.com/rss.xml', folderLabel: 'Desarrollo', note: 'React/CSS, muy didáctico' },

  // Ingeniería de datos / BI
  { title: 'Towards Data Science', url: 'https://towardsdatascience.com/feed', folderLabel: 'Datos', note: 'Data science / ML aplicado' },
  { title: 'Seattle Data Guy', url: 'https://seattledataguy.substack.com/feed', folderLabel: 'Datos', note: 'Ingeniería de datos, BI' },

  // IoT / domótica / 3D
  { title: 'Hackaday', url: 'https://hackaday.com/blog/feed/', folderLabel: 'IoT', note: 'Hardware, hacks, IoT' },
  { title: 'Home Assistant', url: 'https://www.home-assistant.io/atom.xml', folderLabel: 'IoT', note: 'Domótica' },
  { title: 'Adafruit', url: 'https://blog.adafruit.com/feed/', folderLabel: 'IoT', note: 'Electrónica, makers' },
  { title: 'Prusa (impresión 3D)', url: 'https://blog.prusa3d.com/feed/', folderLabel: 'IoT', note: 'Impresión 3D' },

  // Carros / EV
  { title: 'Electrek', url: 'https://electrek.co/feed/', folderLabel: 'Carros', note: 'Autos eléctricos' },
  { title: 'InsideEVs', url: 'https://insideevs.com/rss/articles/all/', folderLabel: 'Carros', note: 'EV, industria' },

  // Android / Pixel
  { title: '9to5Google', url: 'https://9to5google.com/feed/', folderLabel: 'Android', note: 'Pixel, Android, Google' },
  { title: 'Android Police', url: 'https://www.androidpolice.com/feed/', folderLabel: 'Android', note: 'Android a fondo' },

  // Seguridad / leaks (suma a las que ya tienes)
  { title: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/', folderLabel: 'Seguridad', note: 'Análisis de seguridad' },
  { title: 'Google Project Zero', url: 'https://googleprojectzero.blogspot.com/feeds/posts/default', folderLabel: 'Seguridad', note: 'Vulnerabilidades, exploits' },
  { title: 'CISA Advisories', url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', folderLabel: 'Seguridad', note: 'Alertas oficiales' },
];
