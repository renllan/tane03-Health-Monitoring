import { Router } from 'express';
import { DeviceTagController } from '../controller/deviceTagController';

const router = Router();
const deviceTagController = new DeviceTagController();

router.get('/:imei', deviceTagController.getTagsByImei);
router.get('/query/:tag', deviceTagController.queryByTag);
router.post('/add', deviceTagController.addEntry);
router.delete('/delete/:tag', deviceTagController.deleteTag);
router.delete('/delete/:imei/:tag', deviceTagController.deleteTagFromDevice);

export default router;