import { Router } from 'express';
import { DeviceTagController } from '../controller/deviceTagController';

const router = Router();
const deviceTagController = new DeviceTagController();

router.get('/imei/:imei', (req, res) => { deviceTagController.getTagsByImei(req, res); });
router.get('/tag/:tag', (req, res) => { deviceTagController.queryByTag(req, res); });
router.get('/group/:group_id', (req, res) => { deviceTagController.getByGroupId(req, res); });
router.post('/add', (req, res) => { deviceTagController.addEntry(req, res); });
router.delete('/delete/:tag', (req, res) => { deviceTagController.deleteTag(req, res); });
router.delete('/delete/:imei/:tag', (req, res) => { deviceTagController.deleteTagFromDevice(req, res); });
router.delete('/delete/group_tag/:group_id/:tag', (req, res) => { deviceTagController.deleteTagFromGroup(req, res); });
    
export default router;