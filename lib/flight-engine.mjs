export const FLIGHT_STEP_MS = 8000;
export const flightStepMs = flight => Number(flight?.stepMs) || 3200;
export const flightMultiplier = (flight,now) => Math.max(1,1+(now-flight.launchAt)/flightStepMs(flight));
export function settleFlight(flight,now,pay,lose) {
  if(!flight || flight.status==='crashed' || now<flight.launchAt)return false;
  let changed=false;
  const multiplier=flightMultiplier(flight,now);
  for(const bet of flight.bets){
    // Equality loses, matching manual cashout rules. Settle by target time,
    // not by when polling eventually arrives.
    if(bet.status==='active' && bet.autoCashout>=1.25 && bet.autoCashout<flight.crashAt && multiplier>=bet.autoCashout){
      pay(bet,bet.autoCashout,new Date(flight.launchAt+(bet.autoCashout-1)*flightStepMs(flight)).toISOString());changed=true;
    }
  }
  if(multiplier>=flight.crashAt){
    flight.status='crashed';flight.endedAt=new Date(flight.launchAt+(flight.crashAt-1)*flightStepMs(flight)).toISOString();
    for(const bet of flight.bets)if(bet.status==='active')lose(bet,flight.endedAt);
    changed=true;
  }
  return changed;
}
