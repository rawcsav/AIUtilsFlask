function resizeImage(image) {
  if (image.naturalWidth === 256 && image.naturalHeight === 256) {
    image.style.width = "256px";
    image.style.height = "256px";
  } else if (image.naturalWidth === 512 && image.naturalHeight === 512) {
    image.style.width = "512px";
    image.style.height = "512px";
  }
}

function showLoader() {
  const imageContainer = document.getElementById("generated-images");
  const loaderTemplate = document.getElementById("loader-template").innerHTML;

  // Clear the image container and insert the loader HTML
  imageContainer.innerHTML = loaderTemplate;

  // Make the loader visible
  const loader = imageContainer.querySelector(".loader"); // Adjust the selector to target the loader within the container
  if (loader) {
    loader.style.display = "block";
  }
}

function hideLoader() {
  const imageContainer = document.getElementById("generated-images");
  const loader = imageContainer.querySelector(".loader"); // Adjust the selector to target the loader within the container
  if (loader) {
    loader.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", function () {
  function updateImageGenerationMessages(message, status) {
    var messageDiv = document.getElementById("image-generation-messages");
    messageDiv.textContent = message;
    messageDiv.className = status;
  }

  function toggleModelOptions(model) {
    const numberOfImagesContainer = document.getElementById(
      "number-of-images-container"
    );
    const dallE3Options = document.getElementById("dall-e-3-options");

    if (model === "dall-e-3") {
      dallE3Options.style.display = "flex";
      numberOfImagesContainer.style.display = "none";
    } else if (model === "dall-e-2") {
      dallE3Options.style.display = "none";
      numberOfImagesContainer.style.display = "flex";
    }
  }

  function updateSizeOptions(model) {
    const sizeSelect = document.getElementById("size");
    sizeSelect.innerHTML = "";
    const sizeOptions =
      model === "dall-e-2"
        ? ["256x256", "512x512", "1024x1024"]
        : ["1024x1024", "1792x1024", "1024x1792"];
    sizeOptions.forEach((size) => {
      const option = document.createElement("option");
      option.value = size;
      option.text = size;
      sizeSelect.appendChild(option);
    });
  }

  function updateMaxImages(model) {
    const nInput = document.getElementById("n");
    nInput.max = model === "dall-e-2" ? 3 : 1;
    nInput.value = Math.min(nInput.value, nInput.max);
  }

  function updatePromptLength(model) {
    const promptInput = document.getElementById("prompt");
    promptInput.maxLength = model === "dall-e-2" ? 1000 : 4000;
  }

  document.getElementById("model").addEventListener("change", function (event) {
    const selectedModel = event.target.value;
    updateSizeOptions(selectedModel);
    updateMaxImages(selectedModel);
    updatePromptLength(selectedModel);
    toggleModelOptions(selectedModel);
  });

  const currentSelectedModel = document.getElementById("model").value;
  updateSizeOptions(currentSelectedModel);
  updateMaxImages(currentSelectedModel);
  updatePromptLength(currentSelectedModel);
  toggleModelOptions(currentSelectedModel);

  document
    .getElementById("image-generation-form")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      showLoader(); // Call this to show the loader

      var formData = new FormData(this);

      fetch("/image/generate_image", {
        method: "POST",
        headers: {
          "X-CSRFToken": formData.get("csrf_token"),
          "X-Requested-With": "XMLHttpRequest"
        },
        body: formData
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Server returned an error response");
          }
          return response.json();
        })
        .then((data) => {
          if (data.error_message) {
            hideLoader(); // Call this to hide the loader once images are loaded
            console.error("Server error:", data.error_message);
            updateImageGenerationMessages(data.error_message, "error");
          } else {
            hideLoader(); // Call this to hide the loader once images are loaded
            var imageContainer = document.getElementById("generated-images");
            var iconsContainer = document.getElementById("icons-container");

            imageContainer.innerHTML = "";
            iconsContainer.innerHTML = "";

            // Select the last image URL from the array
            var lastImageUrl = data.image_urls[data.image_urls.length - 1];

            // Assuming lastImageUrl is the full path to the image file
            var imageUuid = lastImageUrl.split("/").pop().split(".")[0];

            // Create and append the download link
            var downloadLink = document.createElement("a");
            downloadLink.href = `/image/download_image/${imageUuid}`;
            downloadLink.innerHTML = '<i class="fas fa-download"></i>';
            downloadLink.className = "image-icon download-icon";
            iconsContainer.appendChild(downloadLink);

            // Create and append the open link
            var openLink = document.createElement("a");
            openLink.href = lastImageUrl;
            openLink.target = "_blank";
            openLink.innerHTML = '<i class="fas fa-external-link-alt"></i>';
            openLink.className = "image-icon open-icon";
            iconsContainer.appendChild(openLink);

            // Create and append the image
            var img = document.createElement("img");
            img.onload = function () {
              resizeImage(img);
            };
            img.src = lastImageUrl;
            img.alt = "Generated Image";
            imageContainer.appendChild(img);

            updateImageGenerationMessages(
              "Image generated successfully!",
              "success"
            );
            loadImageHistory();
          }
        })
        .catch((error) => {
          hideLoader(); // Call this to hide the loader once images are loaded

          console.error("Error:", error);
          updateImageGenerationMessages("Error: " + error.message, "error");
        });
    });
  function loadImageHistory() {
    fetch("/image/history", {
      method: "GET",
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      }
    })
      .then((response) => response.json())
      .then((data) => {
        const carousel = document.getElementById("image-history-carousel");
        carousel.innerHTML = ""; // Clear existing items

        // Limit the history to the last 15 images
        const limitedData = data.slice(-15);

        limitedData.forEach((item, index) => {
          // Create an img element with a data-src attribute instead of a src
          const imgThumbnail = document.createElement("img");
          imgThumbnail.dataset.src = item.url; // Store the image URL in data-src for lazy loading
          imgThumbnail.className = "thumbnail lazy";
          imgThumbnail.alt = `Image History ${index + 1}`; // Provide a useful alt attribute
          imgThumbnail.onclick = () => displayImage(item.uuid, item.url);
          carousel.appendChild(imgThumbnail);
        });

        // Initialize lazy loading using IntersectionObserver
        initializeLazyLoading();
      })
      .catch((error) => {
        console.error("Error loading image history:", error);
      });
  }

  function displayImage(uuid, imageUrl) {
    const imageContainer = document.getElementById("generated-images");
    const iconsContainer = document.getElementById("icons-container");

    // Clear existing content
    imageContainer.innerHTML = "";
    iconsContainer.innerHTML = "";

    // Add the selected image
    const img = document.createElement("img");
    img.onload = function () {
      resizeImage(img);
    };
    img.src = imageUrl;
    img.alt = "Generated Image";
    imageContainer.appendChild(img);

    // Add download and open icons
    addDownloadAndOpenIcons(uuid, iconsContainer);
  }

  function addDownloadAndOpenIcons(uuid, iconsContainer) {
    var downloadLink = document.createElement("a");
    downloadLink.href = `/image/download_image/${uuid}`;
    downloadLink.innerHTML = '<i class="fas fa-download"></i>';
    downloadLink.className = "image-icon download-icon";
    iconsContainer.appendChild(downloadLink);

    var openLink = document.createElement("a");
    openLink.href = `/static/temp_img/${uuid}.webp`; // Assuming this is the correct path to the image
    openLink.target = "_blank";
    openLink.innerHTML = '<i class="fas fa-external-link-alt"></i>';
    openLink.className = "image-icon open-icon";
    iconsContainer.appendChild(openLink);
  }

  // Call this function when the page loads to display the user's image history
  function moveCarousel(step) {
    const carouselInner = document.getElementById("carousel-inner");
    const thumbnails = carouselInner.getElementsByClassName("thumbnail");
    const totalThumbnails = thumbnails.length;
    const maxVisibleThumbnails = Math.floor(
      carouselInner.offsetWidth / thumbnails[0].offsetWidth
    );
    const maxIndex = totalThumbnails - maxVisibleThumbnails;

    // Calculate new slide index
    currentSlideIndex = Math.min(
      maxIndex,
      Math.max(0, currentSlideIndex + step)
    );

    // Move carousel to new slide index
    const newLeft = -(thumbnails[0].offsetWidth * currentSlideIndex);
    carouselInner.style.left = `${newLeft}px`;
  }

  function initializeLazyLoading() {
    const lazyImages = document.querySelectorAll(".lazy");

    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const image = entry.target;
          image.src = image.dataset.src; // Set the actual image src from data-src
          image.classList.remove("lazy"); // Remove the lazy class
          observer.unobserve(image); // Stop observing the current target
        }
      });
    });

    lazyImages.forEach((image) => {
      imageObserver.observe(image);
    });
  }

  // Call this function when the page loads to display the user's image history
  loadImageHistory();
});