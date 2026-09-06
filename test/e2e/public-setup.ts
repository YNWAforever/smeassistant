import {startEnvironment} from './environment';
export default async function setup(){const environment=await startEnvironment(3100);return ()=>environment.stop();}
