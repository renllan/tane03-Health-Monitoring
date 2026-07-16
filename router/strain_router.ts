import { Router } from "express";
import { StrainController } from "../controller/strainController";

const router = Router();
const strainController = new StrainController();

router.get("/strain/:imei/:date", (req, res) => strainController.getStrain(req, res));
export default router;