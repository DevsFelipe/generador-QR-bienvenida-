export async function guestIndexes(db,{removeLegacy=false}={}){
 const guests=db.collection('guests');
 await guests.createIndex({eventId:1,rut:1},{name:'event_rut_unique',unique:true,partialFilterExpression:{rut:{$type:'string'}}});
 await guests.createIndex({eventId:1,correoNormalizado:1},{name:'event_email_optional',unique:true,partialFilterExpression:{correoNormalizado:{$type:'string'}}});
 await guests.createIndex({eventId:1,'checkIn.at':1});
 await guests.createIndex({eventId:1,creationOperationId:1},{name:'event_manual_creation_unique',unique:true,partialFilterExpression:{creationOperationId:{$type:'string'}}});
 if(removeLegacy){const old=(await guests.listIndexes().toArray()).find(i=>i.name==='eventId_1_correoNormalizado_1'&&i.unique&&!i.partialFilterExpression);if(old)await guests.dropIndex(old.name);}
 await db.collection('events').createIndex({publicSlug:1},{unique:true,partialFilterExpression:{publicSlug:{$type:'string'}}});
 await db.collection('public_limits').createIndex({expiresAt:1},{expireAfterSeconds:0});
}
