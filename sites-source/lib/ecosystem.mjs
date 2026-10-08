export const ecosystem = [
 {name:'Brand, Website & SEO',description:'Website, GitHub, conținut, conversie',topics:['Website','GitHub','Conținut','SEO','Conversie']},
 {name:'Training & Workshops',description:'Catalog, programe, metodologii, traineri',topics:['Catalog','Programe','Metodologii','Traineri']},
 {name:'Executive Coaching',description:'Servicii, instrumente, aplicație coaching',topics:['Servicii','Instrumente','Aplicație coaching']},
 {name:'Leadership in AI',description:'Program, cercetare, materiale, certificări',topics:['Program','Cercetare','Materiale','Certificări']},
 {name:'Board Games & Simulations',description:'Colliers, mecanici, producție, facilitare',topics:['Colliers','Mecanici','Producție','Facilitare']},
 {name:'Learning Technology',description:'Platformă game design, AI, produse digitale',topics:['Platformă game design','AI','Produse digitale']},
 {name:'Tenders & Procurement Ro',description:'Oportunități, oferte, compliance, dovezi',topics:['Oportunități','Oferte','Compliance','Dovezi']},
 {name:'Sales, Partnerships & Pitches',description:'Oferte, clienți, prezentări, parteneriate',topics:['Oferte','Clienți','Prezentări','Parteneriate']},
 {name:'YoungMinds & Education',description:'Afterschool, assessment, locații',topics:['Afterschool','Assessment','Locații']},
 {name:'Research & Product Validation',description:'Cercetare, experimente, analiză de piață',topics:['Cercetare','Experimente','Analiză de piață']}
];
export const legacyAreas=['Licitații','Personal Brand Bogdan','ONG','After School','Visceral'];
export const aliases={'Licitații':'Tenders & Procurement Ro','Personal Brand Bogdan':'Brand, Website & SEO','After School':'YoungMinds & Education'};
export const canonicalArea=area=>aliases[area]||area;
export const areas=[...ecosystem.map(space=>space.name),...legacyAreas];
