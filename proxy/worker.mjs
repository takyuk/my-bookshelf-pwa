import relay from './ndl.cjs';
import google from './google.cjs';
const googleHandle=google.createGoogleRelay();
const handle=relay.createRelay();
export default {fetch(request,env){return new URL(request.url).pathname==='/api/google-cover' ? googleHandle(request,env.ALLOWED_ORIGIN,env.GOOGLE_BOOKS_API_KEY) : handle(request,env.ALLOWED_ORIGIN);}};
