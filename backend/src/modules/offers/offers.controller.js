import { createOfferSchema } from "./offers.validators.js";
import { createOffer, getOfferById, listOffers } from "./offers.service.js";

export async function getOffers(req, res, next) {
  try {
    const offers = await listOffers();

    return res.status(200).json({
      success: true,
      data: offers,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOffer(req, res, next) {
  try {
    const { id } = req.params;
    const offer = await getOfferById(id);

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: offer,
    });
  } catch (error) {
    next(error);
  }
}

export async function storeOffer(req, res, next) {
  try {
    const parsed = createOfferSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten(),
      });
    }

    const offer = await createOffer(parsed.data);

    return res.status(201).json({
      success: true,
      message: "Offer created successfully",
      data: offer,
    });
  } catch (error) {
    next(error);
  }
}
