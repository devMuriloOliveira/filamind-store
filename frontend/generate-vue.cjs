// Historical one-time conversion helper. Do not rerun: Vue components have since been edited.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('frontend');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const write = (name, content) => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
};
const main = (html) => html.match(/<main\b[\s\S]*?<\/main>/)[0];
const home = read('index.html');
const sections = [...main(home).matchAll(/<section\b[\s\S]*?<\/section>/g)].map(([section]) => section);
for (const [name, section] of ['HeroSection', 'BenefitsSection', 'FeaturesSection', 'ComparisonSection', 'PlansSection', 'SignupSection'].map((name, i) => [name, sections[i]])) {
  write(`src/components/home/${name}.vue`, `<template>\n${section}\n</template>\n`);
}
const imports = ['HeroSection', 'BenefitsSection', 'FeaturesSection', 'ComparisonSection', 'PlansSection', 'SignupSection']
  .map((name) => `import ${name} from '../components/home/${name}.vue'`).join('\n');
write('src/views/HomeView.vue', `<script setup>\n${imports}\n</script>\n\n<template>\n  <main id="conteudo">\n    <HeroSection />\n    <BenefitsSection />\n    <FeaturesSection />\n    <ComparisonSection />\n    <PlansSection />\n    <SignupSection />\n  </main>\n</template>\n`);
for (const [slug, name] of [['ofertas', 'OffersView'], ['privacidade', 'PrivacyView'], ['termos', 'TermsView'], ['cookies', 'CookiesView'], ['reembolso', 'RefundView']]) {
  write(`src/views/${name}.vue`, `<template>\n${main(read(`${slug}/index.html`))}\n</template>\n`);
}
write('src/assets/styles/landing.css', read('landing.css'));
fs.cpSync(path.join(root, 'assets'), path.join(root, 'public/assets'), { recursive: true });
