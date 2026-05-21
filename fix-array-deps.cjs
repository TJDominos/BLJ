const fs = require('fs');
let code = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

// replace "table?.seats" in dependency arrays by explicitly extracting a string representation.
// Dependency arrays are usually at the end of hooks, like `}, [..., table?.seats, ...]);`

// We can do a global replace of `table?.seats` with `JSON.stringify(table?.seats)` ONLY on lines that start with `  }, [` or `}, [`
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('}, [') && lines[i].includes('table?.seats')) {
    lines[i] = lines[i].replace(/table\?\.seats/g, 'JSON.stringify(table?.seats)');
  }
}
code = lines.join('\n');

fs.writeFileSync('src/views/BlackjackTable.tsx', code);
