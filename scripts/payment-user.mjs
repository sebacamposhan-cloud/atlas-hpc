// Read password from stdin; on a terminal disable echo before invoking.
import {passwordHash} from '../server/payments.mjs';
const [username,role]=process.argv.slice(2);if(!/^[\w.@-]{1,100}$/.test(username||'')||!['editor','approver'].includes(role))throw Error('Uso: node scripts/payment-user.mjs usuario editor|approver < archivo-secreto');
let password='';for await(const chunk of process.stdin){password+=chunk;if(password.length>1024)throw Error('Contraseña demasiado larga');}password=password.replace(/\r?\n$/,'');if(password.length<12)throw Error('Usa al menos 12 caracteres');console.log(JSON.stringify({username,role,hash:passwordHash(password)}));
