const fs = require('fs');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

async function test() {
  try {
    const dataBuffer = fs.readFileSync('real-pdf.pdf');
    const data = await pdfParse(dataBuffer);
    console.log('Success:', data.text.substring(0, 50));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();