const fs = require('fs');
const path = require('path');
const dir = '/Users/sameers/Desktop/cafs/public';

try {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

  for (const file of files) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Add cache buster to app.js
    content = content.replace(/src="js\/app\.js"/g, 'src="js/app.js?v=2"');
    
    // Inject TomSelect CSS in <head> if not already there
    if (!content.includes('tom-select.css')) {
      content = content.replace(
        /<link rel="stylesheet" href="css\/index\.css" \/>/g,
        '<link href="https://cdn.jsdelivr.net/npm/tom-select@2.2.2/dist/css/tom-select.css" rel="stylesheet">\n    <link rel="stylesheet" href="css/index.css" />'
      );
      content = content.replace(
        /<link rel="stylesheet" href="css\/style\.css" \/>/g,
        '<link href="https://cdn.jsdelivr.net/npm/tom-select@2.2.2/dist/css/tom-select.css" rel="stylesheet">\n    <link rel="stylesheet" href="css/style.css" />'
      );
      content = content.replace(
        /<link rel="stylesheet" href="css\/login\.css" \/>/g,
        '<link href="https://cdn.jsdelivr.net/npm/tom-select@2.2.2/dist/css/tom-select.css" rel="stylesheet">\n    <link rel="stylesheet" href="css/login.css" />'
      );
    }
    
    // Inject TomSelect JS before app.js if not already there
    if (!content.includes('tom-select.complete.min.js')) {
      content = content.replace(
        /<script src="js\/app\.js\?v=2"><\/script>/g,
        '<script src="https://cdn.jsdelivr.net/npm/tom-select@2.2.2/dist/js/tom-select.complete.min.js"></script>\n    <script src="js/app.js?v=2"></script>'
      );
    }

    fs.writeFileSync(filePath, content);
    console.log('Updated scripts in ' + file);
  }
} catch(e) {
  console.error(e);
}
