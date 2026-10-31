const PALETTE=['#8caee0','#b39bd8','#91bfa9','#dca4b5','#d9ba91','#8ebecb','#b5c29b','#a5a7d6'];
const amount=value=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(Number(value||0));
const currency=value=>'BDT '+amount(value);
function compact(value){const n=Number(value||0),a=Math.abs(n);return a>=1e7?(n/1e7).toLocaleString('en',{maximumFractionDigits:1})+'cr':a>=1e5?(n/1e5).toLocaleString('en',{maximumFractionDigits:1})+'L':a>=1e3?(n/1e3).toLocaleString('en',{maximumFractionDigits:1})+'k':amount(n);}
function monthLabel(value){return /^\d{4}-\d{2}$/.test(String(value))?new Intl.DateTimeFormat('en',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(value+'-01T00:00:00Z')):String(value??'');}
function dateLabel(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value))?new Intl.DateTimeFormat('en',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')):monthLabel(value);}
module.exports={PALETTE,amount,currency,compact,monthLabel,dateLabel};
