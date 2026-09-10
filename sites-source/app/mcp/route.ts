import { mcpResponse } from '../../lib/mcp-transport.mjs';
import { siteTaskService, commandCenterOrigin } from '../../lib/site-task-service';
export async function POST(request:Request) {
  const service=await siteTaskService();
  if(!service) return Response.json({error:'Authentication required'},{status:401});
  return mcpResponse(request,service,commandCenterOrigin);
}
export function GET(){return new Response(null,{status:405,headers:{Allow:'POST'}})}
