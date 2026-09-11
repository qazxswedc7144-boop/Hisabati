
import { getCurrencyDecimals, getCurrencyFactor } from './src/core/money/currency';
import { decimalToMinor } from './src/core/money/converter';

console.log('--- Financial Debug ---');
console.log('YER Decimals:', getCurrencyDecimals('YER'));
console.log('YER Factor:', getCurrencyFactor('YER'));
console.log('SAR Decimals:', getCurrencyDecimals('SAR'));
console.log('SAR Factor:', getCurrencyFactor('SAR'));

const yerMinor = decimalToMinor(2500, 'YER');
console.log('decimalToMinor(2500, "YER") ->', yerMinor);

const sarMinor = decimalToMinor(3200, 'SAR');
console.log('decimalToMinor(3200, "SAR") ->', sarMinor);

if (yerMinor === 250000) {
  console.log('BUG DETECTED: YER is being treated as 2 decimals!');
}
if (sarMinor === 3200) {
  console.log('BUG DETECTED: SAR is being treated as 0 decimals!');
}
