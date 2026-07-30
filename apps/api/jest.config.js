// Config de Jest para la API (NestJS usa Jest por convención).
// ts-jest compila los .ts al vuelo, así no hay que buildear para testear.
module.exports = {
  preset: 'ts-jest', // transforma TypeScript usando tu tsconfig
  testEnvironment: 'node', // corremos backend, no navegador
  rootDir: 'src', // busca los tests dentro de src/
  testRegex: '.*\\.spec\\.ts$', // archivos que terminan en .spec.ts
  moduleFileExtensions: ['ts', 'js', 'json'],
};
