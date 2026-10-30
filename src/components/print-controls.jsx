'use client';
import {Printer,ArrowLeft} from 'lucide-react';import {Button} from './ui/button';
export default function PrintControls(){return <div className="document-controls no-print"><a href="/" className="text-link"><ArrowLeft size={15}/>Back to workspace</a><Button onClick={()=>window.print()}><Printer size={16}/>Print / Save PDF</Button></div>}
