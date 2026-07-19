setTimeout(
    () => {

        liveImage.style.transform =
            frontCameraSelected
                ? "rotate(270deg)"
                : "rotate(90deg)";

        liveImage.style.visibility =
            "visible";

        status.textContent =
            frontCameraSelected
                ? "📷 Front camera selected"
                : "📷 Back camera selected";

    },
    1800
);
