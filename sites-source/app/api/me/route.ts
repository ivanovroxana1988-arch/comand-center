import {siteUser} from '../../../lib/site-task-service';
import {ownerFor} from '../../../lib/push-notifications.mjs';
export async function GET(){
 const user=await siteUser(),owner=ownerFor(user);
 return owner?Response.json({owner},{headers:{'Cache-Control':'private, no-store'}}):Response.json({error:'Autentificare necesară.'},{status:401});
}
