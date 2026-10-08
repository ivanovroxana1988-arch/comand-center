import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { ecosystemPages } from "../../../db/schema";
import { ecosystem } from "../../../lib/ecosystem.mjs";
export async function GET(){try{return Response.json({pages:await getDb().select().from(ecosystemPages).orderBy(asc(ecosystemPages.id))})}catch{return Response.json({error:"Nu am putut încărca paginile tematice."},{status:500})}}
export async function POST(request:Request){try{const p=await request.json();const area=typeof p.area==="string"?p.area.trim():"",title=typeof p.title==="string"?p.title.trim():"";if(!ecosystem.some((s:{name:string})=>s.name===area)||!title||title.length>120)return Response.json({error:"Indică un spațiu business și un nume de maximum 120 de caractere."},{status:400});await getDb().insert(ecosystemPages).values({area,title,createdAt:new Date().toISOString()}).onConflictDoNothing();return Response.json({page:{area,title}},{status:201})}catch{return Response.json({error:"Pagina nu a fost salvată."},{status:500})}}
