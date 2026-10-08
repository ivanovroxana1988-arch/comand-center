import Module from '../module';
import {notFound} from 'next/navigation';
const sections=['companies','associations','members','experience','experts','requirements','applications','documents','dossiers','configurations'];
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!sections.includes(section))notFound();return <Module key={section} section={section}/>}
