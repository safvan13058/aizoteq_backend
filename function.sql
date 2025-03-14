CREATE OR REPLACE FUNCTION notify_reorder()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock_quantity <= NEW.reorder_level THEN
        -- Raise a notification message
        PERFORM pg_notify(
            'reorder_notification', 
            json_build_object(
                'component', NEW.Component,
                'reference_no', NEW.reference_no,
                'stock_quantity', NEW.stock_quantity,
                'reorder_level', NEW.reorder_level
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_reorder_trigger
AFTER INSERT OR UPDATE ON raw_materials_stock
FOR EACH ROW
EXECUTE FUNCTION notify_reorder();
CREATE OR REPLACE FUNCTION log_reorder_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock_quantity <= NEW.reorder_level THEN
        -- Insert a notification record into the reorder_notifications table
        INSERT INTO reorder_notifications (component, reference_no, stock_quantity, reorder_level)
        VALUES (NEW.Component, NEW.reference_no, NEW.stock_quantity, NEW.reorder_level);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION log_reorder_notification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock_quantity <= NEW.reorder_level THEN
        -- Insert a notification record into the reorder_notifications table
        INSERT INTO reorder_notifications (component, reference_no, stock_quantity, reorder_level)
        VALUES (NEW.Component, NEW.reference_no, NEW.stock_quantity, NEW.reorder_level);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION send_email_on_reorder()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock_quantity <= NEW.reorder_level THEN
        PERFORM pg_send_email(
            'your@email.com', 
            'Reorder Alert', 
            'Stock is low for ' || NEW.Component || ' (Reference: ' || NEW.reference_no || ').'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;






-------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_customer_access_on_room_device_delete()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM customer_access 
    WHERE thing_id = (SELECT thingId FROM devices WHERE deviceId = OLD.device_id);
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER room_device_delete_trigger
AFTER DELETE ON room_device
FOR EACH ROW
EXECUTE FUNCTION delete_customer_access_on_room_device_delete();
--------------------------------------------------------

CREATE OR REPLACE FUNCTION delete_old_audit_logs()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '30 days';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_cleanup_trigger
AFTER INSERT ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION delete_old_audit_logs();
