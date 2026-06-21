"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { LocationPickerMap } from "@/components/portal/LeafletMaps";
import { ghmcDepartments, hyderabadLocalities, nearestGhmcOffice } from "@/lib/app-options";

function AutoNotice({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return <div className="notice row" style={{ alignItems: "start" }}><span>{message}</span><button className="pill" type="button" onClick={onClose}>Close</button></div>;
}

export default function Page() {
  const router = useRouter();
  const [signup,setSignup]=useState(false);
  const [role,setRole]=useState("citizen");
  const [message,setMessage]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [name,setName]=useState("");
  const [locality,setLocality]=useState("");
  const [address,setAddress]=useState("");
  const [latitude,setLatitude]=useState("");
  const [longitude,setLongitude]=useState("");
  const [department,setDepartment]=useState("");
  const [zone,setZone]=useState("");
  const [assignedGhmcOffice,setAssignedGhmcOffice]=useState("");
  const [addLoginLocation,setAddLoginLocation]=useState(false);
  const [busy,setBusy]=useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("portal") === "ghmc") setRole("ghmc");
  }, []);

  const nearestOffice = nearestGhmcOffice(latitude ? Number(latitude) : null, longitude ? Number(longitude) : null);

  useEffect(() => {
    if (!nearestOffice) return;
    setAssignedGhmcOffice(nearestOffice.name);
    setZone((current) => current || nearestOffice.zone);
    setLocality((current) => current || nearestOffice.locality);
  }, [nearestOffice]);

  function getGps() {
    return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      if (!navigator.geolocation) {
        setMessage("GPS is not supported by this browser.");
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setMessage(`GPS captured: ${position.coords.latitude}, ${position.coords.longitude}`);
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      (error) => {
        setMessage(`GPS error: ${error.message}`);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key||url.includes("YOUR_PROJECT")) {
      setMessage("Supabase is not configured. Add real Supabase keys to enable authentication.");
      return;
    }
    if(!/^https:\/\/[a-zA-Z0-9-]+\.supabase\.co\/?$/.test(url) || key.length < 100) {
      setMessage("Supabase keys look wrong. Use Project Settings > API: paste the Project URL into NEXT_PUBLIC_SUPABASE_URL and the anon public key into NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    if (role === "ghmc" && !department) {
      setMessage("Select your GHMC department before logging in.");
      return;
    }
    if (role === "ghmc" && !zone && !locality) {
      setMessage("Enter your assigned GHMC zone or locality.");
      return;
    }
    setBusy(true);
    try {
      const gpsCoords = (!latitude || !longitude) && (signup || addLoginLocation || role === "ghmc") ? await getGps() : null;
      const supabase=createBrowserClient(url,key);
      const finalLatitude = gpsCoords?.latitude ?? (latitude ? Number(latitude) : null);
      const finalLongitude = gpsCoords?.longitude ?? (longitude ? Number(longitude) : null);
      const office = nearestGhmcOffice(finalLatitude, finalLongitude);
      const finalOffice = office?.name || assignedGhmcOffice;
      const finalZone = zone || office?.zone || "";
      const finalLocality = locality || office?.locality || "";
      const result=signup
        ? await supabase.auth.signUp({email,password,options:{data:{full_name:name,role:role === "ghmc" ? "ghmc_staff" : "citizen",department_name:department,locality:finalLocality,address,latitude: finalLatitude,longitude: finalLongitude,zone:finalZone,assigned_ghmc_office:finalOffice}}})
        : await supabase.auth.signInWithPassword({email,password});
      if (result.error) {
        setMessage(result.error.message);
        return;
      }
      if (result.data.session) {
        const profilePayload = signup
          ? { full_name: name, role: role === "ghmc" ? "ghmc_staff" : "citizen", department_name: department, locality: finalLocality, address, latitude: finalLatitude, longitude: finalLongitude, zone: finalZone, assigned_ghmc_office: finalOffice }
          : addLoginLocation
            ? { locality: finalLocality, address, latitude: finalLatitude, longitude: finalLongitude, zone: finalZone, assigned_ghmc_office: finalOffice }
            : role === "ghmc"
              ? { department_name: department, locality: finalLocality, address, latitude: finalLatitude, longitude: finalLongitude, zone: finalZone, assigned_ghmc_office: finalOffice }
            : {};
        if (signup || addLoginLocation || role === "ghmc") {
          const profileResponse = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(profilePayload),
          });
          if (!profileResponse.ok) {
            const profileResult = await profileResponse.json();
            setMessage(profileResult.error || "Logged in, but profile details could not be saved.");
            return;
          }
        }
      }
      if (!signup && result.data.user) {
        const profileResponse = await fetch("/api/profile", { cache: "no-store" });
        const profile = profileResponse.ok ? await profileResponse.json() : null;
        const profileAny = profile as { role?: string; departments?: { name?: string } | { name?: string }[] } | null;
        const profileDepartment = Array.isArray(profileAny?.departments)
          ? profileAny.departments[0]?.name
          : profileAny?.departments?.name;
        if (role === "ghmc" && !["ghmc_staff", "admin"].includes(profileAny?.role ?? "")) {
          await supabase.auth.signOut();
          setMessage("This account is not a GHMC staff/admin account. Ask the Supabase admin to set profiles.role and profiles.department_id.");
          return;
        }
        if (role === "ghmc" && !profileDepartment) {
          await supabase.auth.signOut();
          setMessage("This GHMC account has no department assigned in Supabase.");
          return;
        }
        if (role === "ghmc" && department && profileDepartment !== department) {
          await supabase.auth.signOut();
          setMessage("Selected department does not match this GHMC account.");
          return;
        }
      }
      setMessage(signup ? "Account created. Check your email if confirmation is enabled." : "Login successful. Redirecting...");
      if (!signup || result.data.session) {
        const destination = role==="ghmc"?"/overview":"/dashboard";
        router.push(destination);
        router.refresh();
      }
    } catch {
      setMessage("Could not reach Supabase. Check that NEXT_PUBLIC_SUPABASE_URL is exactly your Project URL and that your internet connection is working.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="auth">
    <section className="auth-copy"><div className="overline" style={{color:"#ffb72b"}}>One account · two connected portals</div><h1 className="display">Civic<span style={{color:"#18d4e8"}}>Safety.</span></h1><p style={{color:"#bbb",lineHeight:1.7,maxWidth:560}}>Citizens report and track civic issues. GHMC teams coordinate repairs, monitor safety, communicate alerts and improve the city with live intelligence.</p><Link className="btn alt" href="/">Back home</Link></section>
    <section className="auth-panel"><form className="auth-box" onSubmit={submit}>
      <div className="tabbar"><button type="button" className={!signup?"active":""} onClick={()=>setSignup(false)}>Login</button><button type="button" className={signup?"active":""} onClick={()=>setSignup(true)}>Signup</button></div>
      <div className="overline">Common account access</div><h2 className="display" style={{fontSize:54,margin:"8px 0 18px"}}>{signup?"Create your account":"Welcome back"}</h2>
      <div className="form-grid"><datalist id="hyderabad-localities">{hyderabadLocalities.map((item) => <option key={item} value={item} />)}</datalist>{signup&&<input className="input" required placeholder="Full name" value={name} onChange={e=>setName(e.target.value)}/>}<input className="input" required type="email" placeholder="Email address" value={email} onChange={e=>setEmail(e.target.value)}/><div style={{position:"relative"}}><input className="input" required type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={{paddingRight:54}}/><button className="pill" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} style={{background:"transparent",border:0,color:"#627277",position:"absolute",right:8,top:9,padding:"4px 8px"}}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
      <select className="input" value={role} onChange={e=>setRole(e.target.value)}><option value="citizen">Citizen portal</option><option value="ghmc">GHMC staff portal</option></select>
      {role==="ghmc" && <select className="input" value={department} onChange={e=>setDepartment(e.target.value)}><option value="">Select your GHMC department</option>{ghmcDepartments.map((item) => <option key={item}>{item}</option>)}</select>}
      {role==="ghmc" && <input className="input" list="hyderabad-localities" required placeholder="Assigned Zone / Locality" value={zone || locality} onChange={e=>{setZone(e.target.value); setLocality(e.target.value);}}/>}
      {!signup && role==="citizen" && <label className="pill" style={{alignItems:"center",gap:8,width:"fit-content"}}><input type="checkbox" checked={addLoginLocation} onChange={e=>setAddLoginLocation(e.target.checked)}/> Add or update my location</label>}
      {(!signup && (role==="ghmc" || (role==="citizen" && addLoginLocation))) && <>
        <input className="input" list="hyderabad-localities" placeholder="Choose or type your Hyderabad locality" value={locality} onChange={e=>setLocality(e.target.value)}/>
        <input className="input" placeholder="Your address or landmark" value={address} onChange={e=>setAddress(e.target.value)}/>
        <div className="grid grid-2"><input className="input" placeholder="Latitude" value={latitude} onChange={e=>setLatitude(e.target.value)}/><input className="input" placeholder="Longitude" value={longitude} onChange={e=>setLongitude(e.target.value)}/></div>
        {assignedGhmcOffice && <div className="notice">Assigned GHMC office: {assignedGhmcOffice}{zone ? ` | ${zone}` : ""}</div>}
        <div className="row" style={{justifyContent:"start"}}><button className="btn alt" type="button" onClick={() => void getGps()}>Use GPS</button><a className="btn alt" href="https://www.openstreetmap.org/search?query=Hyderabad" target="_blank">Search OpenStreetMap</a></div>
        <LocationPickerMap latitude={latitude ? Number(latitude) : null} longitude={longitude ? Number(longitude) : null} onPick={(coords) => { setLatitude(String(coords.latitude)); setLongitude(String(coords.longitude)); setMessage("OpenStreetMap point selected."); }} />
      </>}
      {signup&&role==="citizen"&&<>
        <input className="input" list="hyderabad-localities" placeholder="Choose or type your Hyderabad locality" value={locality} onChange={e=>setLocality(e.target.value)}/>
        <input className="input" placeholder="Your address or landmark" value={address} onChange={e=>setAddress(e.target.value)}/>
        <div className="grid grid-2"><input className="input" placeholder="Latitude" value={latitude} onChange={e=>setLatitude(e.target.value)}/><input className="input" placeholder="Longitude" value={longitude} onChange={e=>setLongitude(e.target.value)}/></div>
        {assignedGhmcOffice && <div className="notice">Assigned GHMC office: {assignedGhmcOffice}{zone ? ` | ${zone}` : ""}</div>}
        <div className="row" style={{justifyContent:"start"}}><button className="btn alt" type="button" onClick={() => void getGps()}>Use GPS</button><a className="btn alt" href="https://www.openstreetmap.org/search?query=Hyderabad" target="_blank">Search OpenStreetMap</a></div>
        <LocationPickerMap latitude={latitude ? Number(latitude) : null} longitude={longitude ? Number(longitude) : null} onPick={(coords) => { setLatitude(String(coords.latitude)); setLongitude(String(coords.longitude)); setMessage("OpenStreetMap point selected."); }} />
      </>}
      {signup&&role==="ghmc"&&<>
        <input className="input" list="hyderabad-localities" placeholder="Choose or type your GHMC locality" value={locality} onChange={e=>setLocality(e.target.value)}/>
        <input className="input" placeholder="Office address or landmark" value={address} onChange={e=>setAddress(e.target.value)}/>
        <div className="grid grid-2"><input className="input" placeholder="Latitude" value={latitude} onChange={e=>setLatitude(e.target.value)}/><input className="input" placeholder="Longitude" value={longitude} onChange={e=>setLongitude(e.target.value)}/></div>
        {assignedGhmcOffice && <div className="notice">Assigned GHMC office: {assignedGhmcOffice}{zone ? ` | ${zone}` : ""}</div>}
        <div className="row" style={{justifyContent:"start"}}><button className="btn alt" type="button" onClick={() => void getGps()}>Use GPS</button><a className="btn alt" href="https://www.openstreetmap.org/search?query=Hyderabad" target="_blank">Search OpenStreetMap</a></div>
        <LocationPickerMap latitude={latitude ? Number(latitude) : null} longitude={longitude ? Number(longitude) : null} onPick={(coords) => { setLatitude(String(coords.latitude)); setLongitude(String(coords.longitude)); setMessage("OpenStreetMap point selected."); }} />
      </>}
      <button className="btn red" disabled={busy}>{busy?"Please wait...":signup?"Create account":"Login"}</button><AutoNotice message={message} onClose={() => setMessage("")}/></div>
    </form></section>
  </main>;
}
