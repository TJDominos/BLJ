import * as fs from 'fs';

let content = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

// replace parseInt(betAmountStr) and similar with parseFloat(betAmountStr.replace(/,/g, ''))
function fixParse(stateName: string) {
  content = content.replace(new RegExp('parseInt\\(' + stateName + '\\)', 'g'), 'parseFloat(' + stateName + '.replace(/,/g, \'\'))');
  content = content.replace(new RegExp('parseInt\\(' + stateName + ' \\|\\| \\\'0\\\'\\)', 'g'), 'parseFloat(' + stateName + '.replace(/,/g, \'\') || \'0\')');
}

fixParse('betAmountStr');
fixParse('pairBetStr');
fixParse('plus3BetStr');

// fix handleBetChange
content = content.replace(
  `let val = e.target.value.replace(/\\D/g, ''); // only digits
    if (val.startsWith('0')) {
      val = val.replace(/^0+/, ''); // clear leading zeros
    }`,
  `let val = e.target.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (val.startsWith('0') && val.length > 1 && !val.startsWith('0.')) {
      val = val.replace(/^0+/, '');
    }`
);

content = content.replace(
  `let val = e.target.value.replace(/\\D/g, ''); // only digits
    if (val.startsWith('0')) {
      val = val.replace(/^0+/, ''); // clear leading zeros
    }`,
  `let val = e.target.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (val.startsWith('0') && val.length > 1 && !val.startsWith('0.')) {
      val = val.replace(/^0+/, '');
    }`
);

content = content.replace(
  `let val = e.target.value.replace(/\\D/g, ''); // only digits
    if (val.startsWith('0')) {
      val = val.replace(/^0+/, ''); // clear leading zeros
    }`,
  `let val = e.target.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (val.startsWith('0') && val.length > 1 && !val.startsWith('0.')) {
      val = val.replace(/^0+/, '');
    }`
);

function fixBlur(setterName: string) {
  content = content.replace(new RegExp(setterName + '\\(nextVal\\.toString\\(\\)\\)', 'g'), setterName + '(nextVal.toLocaleString(\'en-US\', {minimumFractionDigits: 2, maximumFractionDigits: 2}))');
  content = content.replace(new RegExp(setterName + '\\(current\\.toString\\(\\)\\)', 'g'), setterName + '(current.toLocaleString(\'en-US\', {minimumFractionDigits: 2, maximumFractionDigits: 2}))');
}
fixBlur('setBetAmountStr');
fixBlur('setPairBetStr');
fixBlur('setPlus3BetStr');


// Fix input field classes to have padding (px-[6px] or px-1.5)
content = content.replace(
  /className="flex-1 bg-transparent border-none outline-none text-white font-black text-\[14px\] sm:text-\[16px\] md:text-\[14px\] min-w-0 text-center"/g,
  'className="flex-1 bg-transparent border-none outline-none text-white font-black text-[14px] sm:text-[16px] md:text-[14px] min-w-0 text-center px-[6px]"'
);

fs.writeFileSync('src/views/BlackjackTable.tsx', content);
