
class EventSequenceTracker:
    """
    Theo dõi sequence theo từng application.
    Phát hiện sequence trùng và khoảng trống chưa được lấp.
    """

    def __init__(self):
        self.applications = {}

    def process_event(self, event):
        if not isinstance(event, dict):
            raise ValueError("event must be a dictionary")

        required_fields = [
            "bank",
            "applicant_key",
            "application_id",
            "sequence",
        ]

        for field in required_fields:
            if field not in event:
                raise ValueError(f"Missing required field: {field}")

        for field in ["bank", "applicant_key", "application_id"]:
            if not isinstance(event[field], str) or not event[field].strip():
                raise ValueError(f"Invalid field: {field}")

        sequence = event["sequence"]

        if (
            not isinstance(sequence, int)
            or isinstance(sequence, bool)
            or sequence < 1
        ):
            raise ValueError("sequence must be a positive integer")

        key = (
            event["bank"],
            event["applicant_key"],
            event["application_id"],
        )

        if key not in self.applications:
            self.applications[key] = {
                "received": set(),
                "contiguous_sequence": 0,
            }

        state = self.applications[key]
        received = state["received"]

        if sequence in received:
            return {
                "status": "DUPLICATE_SEQUENCE",
                "safe_hold": True,
                "missing_sequences": [],
                "contiguous_sequence": state["contiguous_sequence"],
            }

        previous_missing = self._get_missing_sequences(received)
        previous_contiguous = state["contiguous_sequence"]

        received.add(sequence)

        while state["contiguous_sequence"] + 1 in received:
            state["contiguous_sequence"] += 1

        missing = self._get_missing_sequences(received)

        if missing:
            status = "GAP_DETECTED"
            safe_hold = True
        elif previous_missing:
            status = "GAP_RESOLVED"
            safe_hold = False
        else:
            status = "IN_ORDER"
            safe_hold = False

        return {
            "status": status,
            "safe_hold": safe_hold,
            "missing_sequences": missing,
            "contiguous_sequence": state["contiguous_sequence"],
        }

    @staticmethod
    def _get_missing_sequences(received):
        if not received:
            return []

        contiguous = 0

        while contiguous + 1 in received:
            contiguous += 1

        highest = max(received)

        return [
            number
            for number in range(contiguous + 1, highest)
            if number not in received
        ]
