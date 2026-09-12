import relay from './ndl.cjs';
const handle=relay.createRelay();
export default {fetch(request,env){return handle(request,env.ALLOWED_ORIGIN);}};
