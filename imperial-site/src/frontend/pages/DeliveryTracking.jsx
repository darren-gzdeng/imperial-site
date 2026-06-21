import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { getOrderTracking } from "../api/deliveryApi";
import { loadGoogleMaps } from "../components/maps/googleMapsLoader";

const STORE_ADDRESS = "4 Gatwood Close, Padstow Sydney NSW 2211, Australia";

export default function DeliveryTracking() {
  const { orderId } = useParams();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);
  const driverMarker = useRef(null);
  const destinationMarker = useRef(null);
  const [tracking, setTracking] = useState(null);
  const [eta, setEta] = useState("");
  const [message, setMessage] = useState("Loading delivery tracking...");

  useEffect(() => {
    let isMounted = true;

    const loadTracking = () => {
      getOrderTracking(orderId)
        .then((data) => {
          if (!isMounted) return;
          setTracking(data);
          setMessage("");
        })
        .catch((err) => {
          if (!isMounted) return;
          setMessage(err.message || "Delivery tracking could not be loaded.");
        });
    };

    loadTracking();
    const timer = window.setInterval(loadTracking, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [orderId]);

  useEffect(() => {
    if (!tracking || !mapRef.current) return undefined;

    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return;

        if (!mapInstance.current) {
          mapInstance.current = new maps.Map(mapRef.current, {
            center: { lat: -33.952, lng: 151.031 },
            zoom: 12,
            mapTypeControl: false,
            streetViewControl: false,
          });
          directionsRenderer.current = new maps.DirectionsRenderer({
            map: mapInstance.current,
            suppressMarkers: true,
          });
        }

        const driverPosition = tracking.driver_lat && tracking.driver_lng
          ? { lat: Number(tracking.driver_lat), lng: Number(tracking.driver_lng) }
          : null;
        const origin = driverPosition || STORE_ADDRESS;

        const directionsService = new maps.DirectionsService();
        directionsService.route(
          {
            origin,
            destination: tracking.destination_address,
            travelMode: maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status !== "OK" || !result) {
              setMessage("Route could not be shown for this address yet.");
              return;
            }

            directionsRenderer.current.setDirections(result);
            const leg = result.routes[0]?.legs?.[0];
            setEta(leg?.duration?.text || tracking.eta_text || "");

            if (driverPosition) {
              if (!driverMarker.current) {
                driverMarker.current = new maps.Marker({
                  map: mapInstance.current,
                  title: "Driver",
                  label: "D",
                });
              }
              driverMarker.current.setPosition(driverPosition);
            }

            if (!destinationMarker.current && leg?.end_location) {
              destinationMarker.current = new maps.Marker({
                map: mapInstance.current,
                position: leg.end_location,
                title: "Delivery address",
              });
            }
          }
        );
      })
      .catch((err) => setMessage(err.message));

    return () => {
      cancelled = true;
    };
  }, [tracking]);

  return (
    <main className="tracking-page">
      <section className="tracking-header">
        <div>
          <p>Order #{orderId}</p>
          <h1>Delivery tracking</h1>
        </div>
        <Link to="/products">Continue shopping</Link>
      </section>

      <section className="tracking-layout">
        <div className="tracking-map" ref={mapRef}>
          {message ? <p>{message}</p> : null}
        </div>
        <aside className="tracking-panel">
          <h2>{tracking?.status ? tracking.status.replaceAll("_", " ") : "Preparing"}</h2>
          <dl>
            <div>
              <dt>ETA</dt>
              <dd>{eta || tracking?.eta_text || "Waiting for driver location"}</dd>
            </div>
            <div>
              <dt>Driver</dt>
              <dd>{tracking?.driver_name || "Not assigned yet"}</dd>
            </div>
            <div>
              <dt>Delivery address</dt>
              <dd>{tracking?.destination_address || "Loading..."}</dd>
            </div>
            <div>
              <dt>Last update</dt>
              <dd>{tracking?.updated_at || "Loading..."}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </main>
  );
}
