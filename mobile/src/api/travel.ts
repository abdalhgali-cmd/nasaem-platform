import { api } from "./client";

export type FlightOption={
  id?:string;
  source?:string;
  airline?:string;
  flightNumber?:string|null;
  origin?:{code?:string|null;name?:string|null};
  destination?:{code?:string|null;name?:string|null};
  departureAt?:string;
  arrivalAt?:string;
  durationMinutes?:number|null;
  stops?:number|null;
  baggage?:string|null;
  cabin?:string|null;
  price?:number|string|null;
  currency?:string|null;
  priceSdg?:number|null;
  availableSeats?:number|null;
  externalRef?:string|null;
};

export type FlightSearchResult={
  success:boolean;
  tripConfigured?:boolean;
  tripType:string;
  travelers:number;
  currency:string;
  legs:{leg:number;manual:FlightOption[];trip:FlightOption[]}[];
};

export async function searchFlights(input:{from:string;to:string;date:string;returnDate?:string;travelers:number;tripType:"ONE_WAY"|"ROUND_TRIP"}){
 const q=new URLSearchParams({
  from:input.from,
  to:input.to,
  date:input.date,
  travelers:String(input.travelers),
  tripType:input.tripType,
 });
 if(input.returnDate)q.set("returnDate",input.returnDate);
 return api<FlightSearchResult>("/api/flights/search?"+q.toString());
}

export type FerryOperator={id:string;name:string;nameEn?:string|null;logoKey?:string|null};
export type FerrySchedule={
 id:string;
 operatorId:string;
 origin:string;
 destination:string;
 travelDate:string;
 departureTime?:string|null;
 arrivalTime?:string|null;
 durationMinutes?:number|null;
 basePrice:number|string;
 currency:string;
 capacity?:number|null;
};
export async function getPublicFerries(){
 const r=await api<{success:boolean;data:{operators:FerryOperator[];schedules:FerrySchedule[]}}>("/api/ferries/public");
 return r.data;
}
