// Teacher-only content. Import only from authenticated server routes.
import entries from './problem-bank-data.json';
export type BankProblem={id:string;subject:string;unit:string;title:string;difficulty:string;minutes:number;answer:string;answerLatex:string;solution:string;solutionHtml:string;source:{book:string;code:string;page:string;adaptation:string};width:number;height:number;blocks:({type:'text';text:string}|{type:'math';latex:string})[]};
export const problemBank=entries as BankProblem[];
export const findProblem=(id:string)=>problemBank.find(p=>p.id===id);
export function problemSummary(p:BankProblem){return {id:p.id,subject:p.subject,unit:p.unit,title:p.title,difficulty:p.difficulty,minutes:p.minutes};}
