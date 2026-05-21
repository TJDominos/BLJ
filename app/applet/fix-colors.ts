import fs from 'fs';

function replaceColors(file: string) {
    let s = fs.readFileSync(file, 'utf8');
    s = s.replace(/#5f40a1/g, '#126b6f');
    s = s.replace(/#4a327d/g, '#0d4f52');
    s = s.replace(/#a78bfa/g, '#2ebaba');
    s = s.replace(/#c4b5fd/g, '#28a19b');
    fs.writeFileSync(file, s);
    console.log(`Replaced in ${file}`);
}

replaceColors('src/views/host/HostTableView.tsx');
replaceColors('src/components/WalletSelector.tsx');
