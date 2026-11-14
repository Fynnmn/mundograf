// Íconos de los servicios (trazo de 1,75 sobre una grilla de 24). Los usa la página y el panel.
// Cada uno: nombre que ve el cliente en el panel y el dibujo.
export const ICONOS = {
  marca: { nombre: 'Marca', svg: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' },
  paleta: { nombre: 'Paleta', svg: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2a10 10 0 1 0 0 20c.6 0 1-.4 1-1v-1a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 9 9 0 0 0-9-9z"/>' },
  megafono: { nombre: 'Publicidad', svg: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>' },
  escudo: { nombre: 'Seguridad', svg: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="M9 12h6"/><path d="M12 9v6"/>' },
  libro: { nombre: 'Editorial', svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
  impresora: { nombre: 'Impresión', svg: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>' },
  vinilo: { nombre: 'Vinilo', svg: '<path d="M4 6a3 3 0 0 1 6 0v12a3 3 0 0 1-6 0z"/><path d="M7 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7"/><path d="M13 9h4"/><path d="M13 13h4"/>' },
  cartel: { nombre: 'Cartel', svg: '<rect x="3" y="3" width="18" height="12" rx="1.5"/><path d="M8 21l4-6 4 6"/><path d="M7 8h10"/><path d="M7 11h6"/>' },
  remera: { nombre: 'Textil', svg: '<path d="M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0z"/>' },
  tarjeta: { nombre: 'Papelería', svg: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 10h6"/><path d="M6 14h9"/><circle cx="17.5" cy="10" r="1.5"/>' },
  caja: { nombre: 'Packaging', svg: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>' },
  sello: { nombre: 'Sellos', svg: '<path d="M9 3h6v4a3 3 0 0 1-1 2.2L13 10v3h5a2 2 0 0 1 2 2v3H4v-3a2 2 0 0 1 2-2h5v-3l-1-.8A3 3 0 0 1 9 7z"/><path d="M5 21h14"/>' },
  pantalla: { nombre: 'Digital', svg: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>' },
  tijera: { nombre: 'Corte', svg: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9"/><path d="M14.5 14.5 20 20"/><path d="M8.1 8.1 12 12"/>' },
};

export const icono = (k, size = 28) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(ICONOS[k] || ICONOS.marca).svg}</svg>`;
