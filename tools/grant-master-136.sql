UPDATE app_state SET data=json_set(data,
 '$.economy.mysteryBoxes',json((SELECT json_group_array(json(value)) FROM (
   SELECT value FROM json_each(app_state.data,'$.economy.mysteryBoxes')
   UNION ALL
   SELECT json_object('id','feature-master-136:'||json_extract(value,'$.id'),'userId',json_extract(value,'$.id'),'boxId','box-master-aurora','source','feature-gift-master-136','bet',NULL,'acquiredAt',strftime('%Y-%m-%dT%H:%M:%fZ','now')) FROM json_each(app_state.data,'$.users') WHERE COALESCE(json_extract(value,'$.approved'),1)=1
 ))),
 '$.settings.masterGift136',json_object('grantedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'userIds',json((SELECT json_group_array(json_extract(value,'$.id')) FROM json_each(app_state.data,'$.users') WHERE COALESCE(json_extract(value,'$.approved'),1)=1)))
 ),revision=revision+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1 AND json_extract(data,'$.settings.masterGift136') IS NULL;
