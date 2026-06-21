import { useEffect, useRef, useState } from "react";
import { getDriverOrders, updateDriverTracking } from "../api/deliveryApi";
import { loadGoogleMaps } from "../components/maps/googleMapsLoader";

const STORE_ADDRESS = "4 Gatwood Close, Padstow Sydney NSW 2211, Australia";

export default function DriverDeliveries() {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [message, setMessage] = useState("");
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsRenderer = useRef(null);

  const selectedOrder = orders.find((order) => String(order.order_id) === String(selectedOrderId));

  const loadOrders = () => {
    getDriverOrders()
      .then((data) => {
        setOrders(data);
        if (!selectedOrderId && data[0]) {
          setSelectedOrderId(String(data[0].order_id));
        } else if (selectedOrderId && !data.some((order) => String(order.order_id) === String(selectedOrderId))) {
          setSelectedOrderId(data[0] ? String(data[0].order_id) : "");
        }
      })
      .catch((err) => setMessage(err.message || "Delivery orders could not be loaded."));
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return undefined;

    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return;
        mapInstance.current = new maps.Map(mapRef.current, {
          center: { lat: -33.952, lng: 151.031 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
        });
        directionsRenderer.current = new maps.DirectionsRenderer({ map: mapInstance.current });
      })
      .catch((err) => setMessage(err.message));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedOrder || !mapRef.current) return undefined;

    let cancelled = false;
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled) return;
        if (!mapInstance.current) return;

        const directionsService = new maps.DirectionsService();
        directionsService.route(
          {
            origin: selectedOrder.driver_lat && selectedOrder.driver_lng
              ? { lat: Number(selectedOrder.driver_lat), lng: Number(selectedOrder.driver_lng) }
              : STORE_ADDRESS,
            destination: selectedOrder.destination_address,
            travelMode: maps.TravelMode.DRIVING,
          },
          (result, status) => {
            if (status === "OK" && result) {
              directionsRenderer.current.setDirections(result);
            }
          }
        );
      })
      .catch((err) => setMessage(err.message));

    return () => {
      cancelled = true;
    };
  }, [selectedOrder]);

  const updateCurrentLocation = () => {
    if (!selectedOrder) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateDriverTracking(selectedOrder.order_id, {
          driver_name: driverName,
          driver_lat: position.coords.latitude,
          driver_lng: position.coords.longitude,
          status: "out_for_delivery",
        })
          .then(() => {
            setMessage("Driver location updated.");
            loadOrders();
          })
          .catch((err) => setMessage(err.message || "Driver location could not be updated."));
      },
      () => setMessage("Location permission is required to update driver tracking.")
    );
  };

  const completeDelivery = () => {
    if (!selectedOrder) return;

    updateDriverTracking(selectedOrder.order_id, {
      driver_name: driverName || selectedOrder.driver_name,
      driver_lat: selectedOrder.driver_lat,
      driver_lng: selectedOrder.driver_lng,
      status: "delivered",
      eta_text: "Delivered",
    })
      .then(() => {
        setMessage(`Order #${selectedOrder.order_id} marked as delivered.`);
        loadOrders();
      })
      .catch((err) => setMessage(err.message || "Delivery could not be completed."));
  };

  return (
    <main className="tracking-page">
      <section className="tracking-header">
        <div>
          <p>Driver map</p>
          <h1>Delivery route</h1>
        </div>
      </section>

      <section className="tracking-layout">
        <div className="tracking-map" ref={mapRef}>
          {message ? <p>{message}</p> : null}
        </div>
        <aside className="tracking-panel">
          <label>
            <span>Order</span>
            <select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
              {orders.map((order) => (
                <option key={order.order_id} value={order.order_id}>
                  #{order.order_id} - {order.destination_address}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Driver name</span>
            <input value={driverName} onChange={(event) => setDriverName(event.target.value)} />
          </label>
          <button type="button" onClick={updateCurrentLocation}>Update my location</button>
          <button
            type="button"
            className="tracking-complete-button"
            onClick={completeDelivery}
            disabled={!selectedOrder}
          >
            Complete delivery
          </button>
          {selectedOrder ? (
            <dl>
              <div>
                <dt>Address</dt>
                <dd>{selectedOrder.destination_address}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{selectedOrder.status.replaceAll("_", " ")}</dd>
              </div>
            </dl>
          ) : <p>No delivery orders yet.</p>}
        </aside>
      </section>
    </main>
  );
}
