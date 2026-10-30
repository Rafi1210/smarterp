import {guard} from '@/lib/access.js';
export const GET=guard(async(db,user)=>Response.json({user}));
