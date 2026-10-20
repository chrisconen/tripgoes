// Direct provider destinations only. No affiliate relationship or tracking ID is implied.
export const providers=Object.freeze([
 Object.freeze({id:'skyscanner',name:'Skyscanner',url:'https://www.skyscanner.net/',category:'flights',affiliate:false}),
 Object.freeze({id:'booking',name:'Booking.com',url:'https://www.booking.com/',category:'stays',affiliate:false}),
 Object.freeze({id:'getyourguide',name:'GetYourGuide',url:'https://www.getyourguide.com/',category:'experiences',affiliate:false}),
 Object.freeze({id:'msc',name:'MSC Cruises',url:'https://www.msccruises.com/select-your-country',category:'cruises',affiliate:false})
]);
export function providerDestination(id){
 const provider=providers.find(item=>item.id===id);
 if(!provider)return null;
 const url=new URL(provider.url);
 return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;
}
