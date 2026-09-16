import { mkdirSync, writeFileSync } from 'node:fs';
const pink='#F8C3CC', rose='#ECA5B7', cream='#FFF0CC', mint='#C4DFD0', lilac='#D8CCE9';
const p=(d,fill='none')=>`<path d="${d}" fill="${fill}"/>`;
const r=(x,y,w,h,fill,rx=4)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const c=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const paper=()=>p('M12 5H28L38 15V39Q38 43 34 43H12Q8 43 8 39V9Q8 5 12 5Z',cream)+p('M28 5V12Q28 15 31 15H38',pink);
const icons={
overview:r(6,6,15,20,pink)+r(27,6,15,12,cream)+r(6,32,15,10,mint)+r(27,24,15,18,lilac),
accounts:p('M5 17L24 5L43 17Z',pink)+r(7,36,34,7,rose,2)+p('M11 21V32M24 21V32M37 21V32')+c(24,13,2,cream),
transactions:p('M8 15H39L31 7')+p('M40 33H9L17 41')+p('M39 15L31 23M9 33L17 25')+c(9,15,3,mint)+c(39,33,3,pink),
merchants:r(8,19,32,23,cream)+p('M9 6H39L43 19Q43 27 35 24Q29 28 24 24Q18 28 13 24Q5 27 5 19Z',pink)+p('M17 6L15 19M31 6L33 19')+r(25,29,9,13,mint,2)+p('M13 31H18'),
classifications:r(6,6,15,15,pink,5)+c(34,13.5,7.5,cream)+p('M6 41L14 27L22 41Z',mint)+r(27,27,15,15,lilac,5),
analysis:r(5,7,38,34,cream,6)+p('M12 31L21 23L28 27L37 15V35H12Z',pink)+p('M12 31L21 23L28 27L37 15')+c(37,15,2.5,mint),
statements:paper()+p('M23 36V21M17 27L23 21L29 27M14 12H20'),
canvas:r(5,7,38,33,cream,5)+r(10,12,12,10,pink,2)+p('M11 32L18 27L24 32L35 19M30 19H35V24')+c(31,13,2,mint),
issues:p('M17 12L13 6M31 12L35 6M10 22L5 19M10 30H4M12 37L7 42M38 22L43 19M38 30H44M36 37L41 42')+c(24,17,8,lilac)+r(12,19,24,24,pink,11)+p('M24 23V40')+c(19,15,1,'#60353D')+c(29,15,1,'#60353D'),
database:p('M7 13V36C7 46 41 46 41 36V13Z',lilac)+`<ellipse cx="24" cy="13" rx="17" ry="8" fill="${pink}"/>`+p('M7 24C7 34 41 34 41 24'),
modules:p('M7 8H18C13 0 35 0 30 8H40V19C48 14 48 36 40 31V41H29C34 31 13 31 18 41H7V30C17 35 17 14 7 19Z',mint),
service:r(6,6,36,15,lilac)+r(6,27,36,15,pink)+c(14,13.5,2.5,mint)+c(14,34.5,2.5,cream)+p('M24 13H34M24 34H34'),
users:c(15,15,7,lilac)+c(33,15,7,cream)+p('M3 39V34C3 20 27 20 27 34V39Z',pink)+p('M28 26C36 23 45 27 45 35V39H31',mint),
revenue:c(24,24,19,cream)+p('M30 15C17 10 13 23 24 24C36 25 32 39 18 33M24 10V38'),
profile:c(24,16,10,cream)+p('M7 42V37C7 21 41 21 41 37V42Z',pink)+p('M17 32Q24 38 31 32'),
logout:r(6,6,24,36,pink)+p('M11 10L22 7V40L11 37Z',cream)+c(18,24,1,'#60353D')+p('M28 24H44M37 17L44 24L37 31'),
sheet:paper()+r(14,23,18,14,mint,2)+p('M14 29H32M23 23V37'),
notes:p('M10 6H38Q42 6 42 10V29L29 42H10Q6 42 6 38V10Q6 6 10 6Z',cream)+p('M29 42V33Q29 29 33 29H42',pink)+p('M14 16H32M14 23H26'),
menu:r(6,8,36,8,pink)+r(6,21,28,8,cream)+r(6,34,36,8,mint),
close:p('M12 6L24 18L36 6L42 12L30 24L42 36L36 42L24 30L12 42L6 36L18 24L6 12Z',pink),
};
const output=new URL('../public/icons/piggy/',import.meta.url);
mkdirSync(output,{recursive:true});
for(const [name,body] of Object.entries(icons)) writeFileSync(new URL(`${name}.svg`,output),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none"><g stroke="#60353D" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>\n`);
writeFileSync(new URL('../artifacts/piggy-icons.html',import.meta.url),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Piggy icon family</title><style>body{background:#fff7f5;color:#60353d;font:16px system-ui;margin:40px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px}article{background:white;border:1px solid #eed6dc;border-radius:20px;text-align:center;padding:24px 12px}img{width:64px;height:64px}small{display:block;margin-top:16px;text-transform:capitalize}.sizes{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:12px}.sizes img{width:20px;height:20px}.sizes img+img{width:28px;height:28px}</style><h1>Piggy icon family</h1><p>Rounded cocoa outlines · soft pastel fills · scalable SVG</p><div class="grid">${Object.keys(icons).map(name=>`<article><img src="../public/icons/piggy/${name}.svg" alt="${name}"><small>${name}</small><div class="sizes"><img src="../public/icons/piggy/${name}.svg" alt=""><img src="../public/icons/piggy/${name}.svg" alt=""></div></article>`).join('')}</div></html>`);
console.log(`Created ${Object.keys(icons).length} SVG icons.`);

