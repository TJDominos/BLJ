const fs = require('fs');
let s = fs.readFileSync('src/views/BlackjackTable.tsx', 'utf8');

const startStr = "{(() => {\\n                    const displaySeats";
const endStr = "return displaySeats.map(({ seat, seatIdx }) => {\\n";

const startIdx = s.indexOf("{(() => {");
const endIdx = s.indexOf(endStr);
if (startIdx !== -1 && endIdx !== -1) {
    const p1 = s.substring(0, startIdx);
    const p2 = s.substring(endIdx + endStr.length);
    s = p1 + "{table.seats.map((seat, seatIdx) => {\\n" + p2;
    s = s.replace("})})()}", "})}");
    fs.writeFileSync('src/views/BlackjackTable.tsx', s);
    console.log("Fixed successfully.");
} else {
    console.log("Not found.");
}
