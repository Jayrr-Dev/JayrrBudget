const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, 'pig-emotions');
fs.mkdirSync(dir, { recursive: true });
const source = fs.readFileSync(path.join(__dirname, 'thinking-pig.svg'), 'utf8');
const base = source.slice(source.indexOf('      <!-- Soft triangular'), source.indexOf('      <!-- One eyebrow'));
const snout = source.slice(source.indexOf('      <g fill="#EF94AF"'), source.indexOf('      <path d="M193 299'));
const p = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const eyes = `<g fill="#60353D" stroke="none"><ellipse cx="146" cy="212" rx="11" ry="15"/><ellipse cx="254" cy="212" rx="11" ry="15"/><circle cx="149" cy="207" r="3.5" fill="#FFF5F3"/><circle cx="257" cy="207" r="3.5" fill="#FFF5F3"/></g>`;
const smile = p('M181 294Q200 312 219 294');
const heart = (x,y,s=1) => `<g transform="translate(${x} ${y}) scale(${s})">${p('M0 9C-23-7-18-23-6-20Q0-19 0-13Q5-24 15-19C30-10 13 3 0 9Z','fill="#E87B9B" stroke="none"')}</g>`;
const star = (x,y) => p(`M${x} ${y-13}Q${x+2} ${y-2} ${x+12} ${y}Q${x+2} ${y+2} ${x} ${y+13}Q${x-2} ${y+2} ${x-12} ${y}Q${x-2} ${y-2} ${x} ${y-13}Z`, 'fill="#E9B85F" stroke="none"');
const faces = {
  neutral: { eyes, mouth:p('M189 297H211'), motion:'breathe' },
  happy: { eyes:p('M134 214Q146 193 158 214M242 214Q254 193 266 214'), mouth:smile, motion:'sway' },
  sad: { eyes:eyes+p('M130 182L157 173M243 173L270 182'), mouth:p('M183 306Q200 291 217 306'), extras:`<g class="tear">${p('M140 231C140 231 130 244 130 250A10 10 0 0 0 150 250C150 243 140 231 140 231Z','fill="#94CCE6" stroke="none"')}</g>`, motion:'breathe' },
  angry: { eyes:eyes+p('M128 178L160 190M240 190L272 178'), mouth:p('M181 304Q200 290 219 304'), extras:`<g class="accent" stroke="#D06B83" stroke-width="5">${p('M287 150V159H278M297 150V159H306M287 178V169H278M297 178V169H306')}</g>`, motion:'huff' },
  surprised: { eyes:eyes+p('M131 176Q146 165 161 176M239 176Q254 165 269 176'), mouth:'<ellipse cx="200" cy="301" rx="10" ry="13" fill="#60353D" stroke="none"/>', top:`<g class="accent" stroke="#D6A056" stroke-width="7">${p('M200 50V72M200 87V88')}</g>`, motion:'breathe' },
  sleepy: { eyes:p('M134 213Q146 224 158 213M242 213Q254 224 266 213'), mouth:'<ellipse cx="200" cy="299" rx="8" ry="6" fill="#60353D" stroke="none"/>', top:`<g class="accent" stroke="#A28DBB" stroke-width="5">${p('M264 76H282L264 94H282M291 43H316L291 67H316')}</g>`, motion:'sleep' },
  love: { eyes:heart(146,212,.8)+heart(254,212,.8), mouth:smile, top:`<g class="accent">${heart(252,75,.8)+heart(302,56,.55)}</g>`, motion:'sway' },
  confused: { eyes:eyes+p('M129 185Q144 178 159 185M239 172Q254 161 270 172'), mouth:p('M182 300Q191 290 200 300T218 300'), top:`<g class="accent" stroke="#AA718B" stroke-width="7">${p('M270 46C270 29 299 28 300 45C301 58 283 59 283 71M282 85V86')}</g>`, motion:'sway' },
  excited: { eyes:p('M133 200L151 211L133 222M267 200L249 211L267 222'), mouth:p('M177 291Q200 287 223 291Q218 319 200 320Q182 319 177 291Z','fill="#60353D"')+p('M187 311Q200 301 213 311Q201 324 187 311Z','fill="#EB91AA" stroke="none"'), top:`<g class="accent">${star(102,63)+star(296,58)+star(340,137)}</g>`, motion:'bounce' },
};
const css = ` .pig{transform-origin:200px 240px;animation:var(--motion) 3s ease-in-out infinite}.eyes{transform-origin:200px 212px;animation:blink 5.6s infinite}.accent{animation:float 3s ease-in-out infinite}.tear{animation:teardrop 2.8s ease-in infinite}@keyframes breathe{50%{transform:translateY(-3px)}}@keyframes sway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg) translateY(-3px)}}@keyframes huff{0%,100%{transform:translateY(1px)}50%{transform:translateY(-3px) scale(1.025)}}@keyframes sleep{50%{transform:translateY(4px) rotate(2deg)}}@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@keyframes blink{0%,43%,47%,100%{transform:scaleY(1)}45%{transform:scaleY(.08)}}@keyframes float{0%,100%{transform:translateY(0);opacity:.65}50%{transform:translateY(-8px);opacity:1}}@keyframes teardrop{0%{transform:translateY(0);opacity:0}20%{opacity:1}85%,100%{transform:translateY(30px);opacity:0}}@media(prefers-reduced-motion:reduce){.pig,.eyes,.accent,.tear{animation:none}}`;
for (const [name, f] of Object.entries(faces)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" fill="none" role="img" aria-labelledby="title desc"><title id="title">${name[0].toUpperCase()+name.slice(1)} pig</title><desc id="desc">Animated pink pig head with a ${name} expression. Transparent, scalable vector artwork.</desc><style>${css}</style><g stroke="#60353D" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${f.top||''}<g class="pig" style="--motion:${f.motion}">${base}<g class="eyes">${f.eyes}</g>${snout}${f.mouth}${f.extras||''}</g></g></svg>`;
  fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
}
fs.copyFileSync(path.join(__dirname, 'thinking-pig.svg'), path.join(dir, 'thinking.svg'));
const names = [...Object.keys(faces), 'thinking'];
fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pip's little moods</title><style>*{box-sizing:border-box}body{margin:0;padding:48px 24px;background:#fff7f5;color:#60353d;font-family:system-ui,sans-serif}main{max-width:1100px;margin:auto}h1{font-size:36px;margin:0 0 8px}p{color:#956a74;margin:0 0 32px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:18px}a{display:block;text-align:center;background:#fff;border:1px solid #f1dce1;border-radius:24px;padding:8px 12px 20px;color:inherit;text-decoration:none}a:hover{background:#ffedf1}img{width:100%;height:auto;display:block}span{text-transform:capitalize;font-weight:600}</style><main><h1>Pip's little moods</h1><p>Ten animated expressions. Transparent backgrounds. Scale to any size. Click a pig to open its SVG.</p><div class="grid">${names.map(n=>`<a href="${n}.svg"><img src="${n}.svg" alt="${n} pig"><span>${n}</span></a>`).join('')}</div></main></html>`);
console.log(`Created ${names.length} SVGs and gallery in ${dir}`);
