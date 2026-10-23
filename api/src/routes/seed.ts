import { Hono } from 'hono';
import { db } from '../db';
import { entityTypes, fieldDefinitions, entityRecords, fieldValues, roles, relationshipDefinitions, relationshipRecords } from '../../../drizzle/schema';
import { eq, and, or, sql, inArray } from 'drizzle-orm';

const seed = new Hono();

function genId(): string {
  const h = '0123456789abcdef';
  let u = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { u += '-'; continue; }
    if (i === 14) { u += '4'; continue; }
    if (i === 19) { u += h[8 + Math.floor(Math.random() * 4)]; continue; }
    u += h[Math.floor(Math.random() * 16)];
  }
  return u;
}
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randBetween(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }

const FM = ['James','John','Robert','Michael','David','William','Richard','Joseph','Thomas','Charles','Daniel','Matthew','Anthony','Mark','Steven','Paul','Andrew','Joshua','Kevin','Brian','George','Timothy','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon','Benjamin','Samuel','Raymond','Gregory','Frank','Alexander','Patrick','Jack','Dennis','Jerry','Tyler','Aaron','Adam','Nathan','Henry','Peter','Douglas','Carl','Arthur','Gerald','Keith','Sean','Austin','Jesse','Bruce','Logan','Jordan','Vincent','Louis','Philip','Harry','Walter'];
const FF = ['Mary','Patricia','Jennifer','Linda','Barbara','Elizabeth','Susan','Jessica','Sarah','Karen','Lisa','Nancy','Betty','Margaret','Sandra','Ashley','Emily','Donna','Michelle','Carol','Amanda','Melissa','Stephanie','Rebecca','Sharon','Laura','Cynthia','Kathleen','Amy','Angela','Anna','Brenda','Pamela','Emma','Nicole','Helen','Samantha','Katherine','Christine','Debra','Rachel','Carolyn','Janet','Catherine','Maria','Heather','Diane','Ruth','Julie','Olivia','Joyce','Virginia','Victoria','Kelly','Lauren','Christina','Joan','Evelyn','Judith','Megan','Andrea','Cheryl','Hannah','Jacqueline','Martha','Gloria','Ann','Sara','Madison','Frances','Kathryn','Janice','Jean','Abigail','Alice','Judy','Sophia','Grace','Denise','Amber','Doris','Marilyn','Danielle','Beverly','Isabella','Theresa','Diana','Natalie','Brittany','Charlotte','Marie','Kayla','Alexis','Lori'];
const LN = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts','Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes','Stewart','Morris','Murphy','Cook','Rogers','Ortiz','Morgan','Cooper','Peterson','Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson','Watson','Brooks','Chavez','Wood','Bennett','Gray','Mendoza','Ruiz','Hughes','Price','Alvarez','Sanders','Patel','Myers','Long','Ross','Foster','Powell','Jenkins','Perry','Russell','Sullivan','Bell','Coleman','Butler','Henderson','Barnes','Fisher','Simmons','Patterson','Jordan','Reynolds','Hamilton','Graham','Wallace','Woods','Cole','West','Hayes','Gibson','Bryant','Ellis','Stevens','Murray','Ford','Marshall','Owens','Harrison','Fernandez','Wells','Webb','Simpson','Tucker','Porter','Hunter','Hicks','Crawford','Henry','Boyd','Mason','Kennedy','Warren','Dixon','Burns','Gordon','Shaw','Holmes','Rice','Robertson','Hunt','Black','Daniels','Palmer','Mills','Grant','Curtis','Ferguson','Rose','Stone','Hawkins','Dunn','Perkins','Hudson','Spencer','Fox'];

const SUBJS = [{n:'Mathematics',c:'MATH'},{n:'English Language',c:'ENG'},{n:'Kiswahili',c:'KIS'},{n:'Science',c:'SCI'},{n:'Social Studies',c:'SST'},{n:'Religious Education',c:'RE'},{n:'Physical Education',c:'PE'},{n:'Art & Craft',c:'ART'},{n:'Music',c:'MUS'},{n:'Computer Studies',c:'CS'}];
const CLSS = ['Grade 1A','Grade 1B','Grade 2A','Grade 2B','Grade 3A','Grade 3B','Grade 4A','Grade 4B','Grade 5A','Grade 5B','Grade 6A','Grade 6B','Grade 7A','Grade 7B','Grade 8A','Grade 8B'];

seed.post('/seed-school', async (c) => {
  if (process.env.NODE_ENV !== 'development') {
    return c.json({ error: 'Seeding is only available in development mode' }, 403);
  }
  try {
    const schoolId = c.get('schoolId' as never) as string;

    const types = await db.query.entityTypes.findMany({ where: eq(entityTypes.schoolId, schoolId) });
    const typeMap = new Map(types.map(t => [t.internalName, t.id]));

    // Field definitions per entity type
    // Shorthand: n=name, i=internalName, d=dataType, o=options, m=isMultiple
    const FD: Record<string, Array<{n:string;i:string;d:string;o?:string[];m?:boolean}>> = {
      learner: [{n:'Photo',i:'photo',d:'file'},{n:'First Name',i:'first_name',d:'text'},{n:'Last Name',i:'last_name',d:'text'},{n:'Date of Birth',i:'date_of_birth',d:'date'},{n:'Gender',i:'gender',d:'select',o:['Male','Female']},{n:'Admission Number',i:'admission_number',d:'text'},{n:'Parent Name',i:'parent_name',d:'text'},{n:'Parent Phone',i:'parent_phone',d:'text',m:true},{n:'Address',i:'address',d:'text',m:true},{n:'Fee Balance',i:'fee_balance',d:'number'},{n:'Status',i:'status',d:'select',o:['Active','Inactive','Graduated']}],
      teacher: [{n:'Photo',i:'photo',d:'file'},{n:'First Name',i:'first_name',d:'text'},{n:'Last Name',i:'last_name',d:'text'},{n:'Employee ID',i:'employee_id',d:'text'},{n:'Phone',i:'phone',d:'text',m:true},{n:'Email',i:'email',d:'text',m:true},{n:'Department',i:'department',d:'select',o:['Mathematics','Languages','Sciences','Humanities','Arts','Physical Education']},{n:'Qualification',i:'qualification',d:'select',o:['Bachelor','Diploma','Masters']},{n:'Salary',i:'salary',d:'number'},{n:'Status',i:'status',d:'select',o:['Active','On Leave','Resigned']}],
      class: [{n:'Photo',i:'photo',d:'file'},{n:'Class Name',i:'class_name',d:'text'},{n:'Grade Level',i:'grade_level',d:'number'},{n:'Capacity',i:'capacity',d:'number'},{n:'Room Number',i:'room_number',d:'text'}],
      subject: [{n:'Photo',i:'photo',d:'file'},{n:'Subject Name',i:'subject_name',d:'text'},{n:'Subject Code',i:'subject_code',d:'text'},{n:'Category',i:'category',d:'select',o:['Core','Optional']},{n:'Weekly Hours',i:'weekly_hours',d:'number'}],
      term: [{n:'Term Name',i:'term_name',d:'text'},{n:'Academic Year',i:'academic_year',d:'text'},{n:'Start Date',i:'start_date',d:'date'},{n:'End Date',i:'end_date',d:'date'},{n:'Status',i:'status',d:'select',o:['Active','Completed','Upcoming']}],
      assessment: [{n:'Assessment Name',i:'assessment_name',d:'text'},{n:'Type',i:'type',d:'select',o:['Exam','Quiz','Assignment','CAT']},{n:'Subject',i:'subject',d:'text'},{n:'Max Score',i:'max_score',d:'number'},{n:'Date',i:'date',d:'date'},{n:'Status',i:'status',d:'select',o:['Scheduled','Completed','Graded']}],
      enrollment: [{n:'Learner Ref',i:'learner_ref',d:'text'},{n:'Class Ref',i:'class_ref',d:'text'},{n:'Term Ref',i:'term_ref',d:'text'},{n:'Enrollment Date',i:'enrollment_date',d:'date'},{n:'Status',i:'status',d:'select',o:['Enrolled','Withdrawn','Completed']}],
    };

    // Ensure field definitions exist
    const fIds: Record<string, Record<string, string>> = {};
    for (const [eName, fields] of Object.entries(FD)) {
      const tId = typeMap.get(eName);
      if (!tId) continue;
      fIds[eName] = {};
      const existing = await db.query.fieldDefinitions.findMany({ where: and(eq(fieldDefinitions.schoolId, schoolId), eq(fieldDefinitions.entityTypeId, tId)) });
      const existMap = new Map(existing.map(f => [f.internalName, f.id]));
      const toInsert = fields.filter(f => !existMap.has(f.i)).map(f => ({
        id: genId(), schoolId, entityTypeId: tId, name: f.n, internalName: f.i, dataType: f.d,
        options: f.o || null, isMultiple: f.m || false,
        validationRules: f.d === 'file' ? { fileSubtype: 'image' } : {},
      }));
      if (toInsert.length) await db.insert(fieldDefinitions).values(toInsert);
      for (const f of fields) fIds[eName][f.i] = existMap.get(f.i) || toInsert.find(x => x.internalName === f.i)!.id;
    }

    // ─── Clean slate: skip if data already exists ───
    const existingRecords = await db.query.entityRecords.findMany({
      where: (er, { and: a, eq: e }) => a(e(er.schoolId, schoolId)),
      columns: { id: true },
      limit: 1,
    });
    if (existingRecords.length > 0) {
      return c.json({ success: true, data: { terms: 0, subjects: 0, classes: 0, teachers: 0, learners: 0, assessments: 0 }, message: 'Data already exists. Clear school data first to re-seed.' });
    }

    const counts = { terms: 0, subjects: 0, classes: 0, teachers: 0, learners: 0, assessments: 0 };

    // Batch create records + field values (supports parentRecordId for hierarchy)
    async function batch(typeName: string, rows: Record<string, any>[]): Promise<string[]> {
      const tId = typeMap.get(typeName);
      if (!tId) return [];
      const rIds = rows.map(() => genId());
      await db.insert(entityRecords).values(rIds.map((id, i) => ({
        id, schoolId, entityTypeId: tId,
        parentRecordId: rows[i].__parentRecordId || null,
      })));
      const fvs: any[] = [];
      for (let ri = 0; ri < rows.length; ri++) {
        for (const [key, val] of Object.entries(rows[ri])) {
          if (key === '__parentRecordId') continue; // skip internal prop
          if (val == null) continue;
          const fId = fIds[typeName]?.[key];
          if (!fId) continue;
          const row: any = { schoolId, entityRecordId: rIds[ri], fieldDefinitionId: fId };
          if (typeof val === 'number') row.numericValue = val;
          else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) row.dateValue = val;
          else row.textValue = String(val);
          fvs.push(row);
        }
      }
      // Insert in chunks of 100
      for (let i = 0; i < fvs.length; i += 100) {
        await db.insert(fieldValues).values(fvs.slice(i, i + 100));
      }
      return rIds;
    }

    // ─── Terms ───
    const termIds = await batch('term', [
      { term_name: 'Term 1 2026', academic_year: '2026', start_date: '2026-01-05', end_date: '2026-04-01', status: 'Completed' },
      { term_name: 'Term 2 2026', academic_year: '2026', start_date: '2026-04-27', end_date: '2026-08-01', status: 'Active' },
      { term_name: 'Term 3 2026', academic_year: '2026', start_date: '2026-08-25', end_date: '2026-11-20', status: 'Upcoming' },
    ]);
    counts.terms = termIds.length;

    // ─── Subjects ───
    const subjectIds = await batch('subject', SUBJS.map(s => ({ subject_name: s.n, subject_code: s.c, category: 'Core', weekly_hours: randBetween(3, 6) })));
    counts.subjects = subjectIds.length;

    // ─── Classes (parent + child streams) ───
    // Create parent classes first
    const GRADES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8'];
    const parentClassIds = await batch('class', GRADES.map((g, i) => ({
      class_name: g, grade_level: i + 1, capacity: randBetween(80, 150), room_number: `Block ${String.fromCharCode(65 + i)}`,
    })));
    counts.classes = parentClassIds.length;

    // Create child streams (A/B per grade)
    const childClassData: Record<string, any>[] = [];
    const STREAMS = ['A', 'B'];
    for (let gi = 0; gi < GRADES.length; gi++) {
      for (const stream of STREAMS) {
        childClassData.push({
          class_name: `${GRADES[gi]}${stream}`,
          grade_level: gi + 1,
          capacity: randBetween(30, 45),
          room_number: `${String.fromCharCode(65 + gi)}${stream}`,
          __parentRecordId: parentClassIds[gi],
        });
      }
    }
    const childClassIds = await batch('class', childClassData);
    counts.classes += childClassIds.length;

    // ─── Teachers (10) ───
    const teachers: any[] = [];
    for (let i = 0; i < 10; i++) {
      const f = pick([...FM, ...FF]), l = pick(LN);
      teachers.push({ first_name: f, last_name: l, employee_id: `T${String(i+1).padStart(3,'0')}`, phone: `+254${randBetween(700000000,799999999)}`, email: `${f.toLowerCase()}.${l.toLowerCase()}@school.ac.ke`, department: pick(['Mathematics','Languages','Sciences','Humanities','Arts','Physical Education']), qualification: pick(['Bachelor','Diploma','Masters']), salary: randBetween(35000,85000), status: 'Active' });
    }
    const teacherIds = await batch('teacher', teachers);
    counts.teachers = teacherIds.length;

    // ─── Teacher Relationships (subjects + classes) ───
    const relDefs = await db.query.relationshipDefinitions.findMany({
      where: (rd, { and: a, eq: e }) => a(e(rd.schoolId, schoolId), e(rd.isActive, true)),
    });
    const teacherTypeId = typeMap.get('teacher');
    const subjectTypeId = typeMap.get('subject');
    const classTypeId = typeMap.get('class');

    const teacherSubjectRel = relDefs.find(rd =>
      (rd.fromEntityTypeId === subjectTypeId && rd.toEntityTypeId === teacherTypeId) ||
      (rd.fromEntityTypeId === teacherTypeId && rd.toEntityTypeId === subjectTypeId)
    );
    const teacherClassRel = relDefs.find(rd =>
      (rd.fromEntityTypeId === teacherTypeId && rd.toEntityTypeId === classTypeId) ||
      (rd.fromEntityTypeId === classTypeId && rd.toEntityTypeId === teacherTypeId)
    );

    const relRows: any[] = [];
    for (const tId of teacherIds) {
      // Assign 2-4 random subjects per teacher
      const subCount = randBetween(2, 4);
      const shuffledSubs = [...subjectIds].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(subCount, shuffledSubs.length); i++) {
        if (teacherSubjectRel) {
          const isFrom = teacherSubjectRel.fromEntityTypeId === teacherTypeId;
          relRows.push({
            schoolId,
            relationshipDefinitionId: teacherSubjectRel.id,
            fromEntityRecordId: isFrom ? tId : shuffledSubs[i],
            toEntityRecordId: isFrom ? shuffledSubs[i] : tId,
          });
        }
      }
      // Assign 1-2 random classes per teacher (use child streams, not parents)
      const classCount = randBetween(1, 2);
      const shuffledClasses = [...childClassIds].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(classCount, shuffledClasses.length); i++) {
        if (teacherClassRel) {
          const isFrom = teacherClassRel.fromEntityTypeId === teacherTypeId;
          relRows.push({
            schoolId,
            relationshipDefinitionId: teacherClassRel.id,
            fromEntityRecordId: isFrom ? tId : shuffledClasses[i],
            toEntityRecordId: isFrom ? shuffledClasses[i] : tId,
          });
        }
      }
    }
    if (relRows.length) {
      for (let i = 0; i < relRows.length; i += 100) {
        await db.insert(relationshipRecords).values(relRows.slice(i, i + 100));
      }
    }

    // ─── Learners (100) ───
    const learners: any[] = [];
    for (let i = 0; i < 100; i++) {
      const g = Math.random() > 0.5 ? 'Male' : 'Female';
      const f = g === 'Male' ? pick(FM) : pick(FF);
      const l = pick(LN);
      const gr = randBetween(1, 8);
      learners.push({ first_name: f, last_name: l, date_of_birth: `${2026-gr-randBetween(5,7)}-${String(randBetween(1,12)).padStart(2,'0')}-${String(randBetween(1,28)).padStart(2,'0')}`, gender: g, admission_number: `ADM${String(i+1).padStart(4,'0')}`, parent_name: `${pick(FM)} ${l}`, parent_phone: `+254${randBetween(700000000,799999999)}`, address: pick(['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret','Thika','Nyeri','Meru','Machakos','Kitale']), fee_balance: Math.random() > 0.7 ? randBetween(1000,50000) : 0, status: 'Active' });
    }
    const learnerIds = await batch('learner', learners);
    counts.learners = learnerIds.length;

    // ─── Enrollments (100) — distribute across child streams ───
    const enrollments: any[] = [];
    for (let i = 0; i < learnerIds.length; i++) {
      const ci = Math.min(Math.floor((i / learnerIds.length) * childClassIds.length), childClassIds.length - 1);
      if (childClassIds[ci] && termIds[1]) {
        enrollments.push({ learner_ref: learnerIds[i], class_ref: childClassIds[ci], term_ref: termIds[1], enrollment_date: '2026-04-27', status: 'Enrolled' });
      }
    }
    await batch('enrollment', enrollments);

    // ─── Assessment Relationship Definitions ───
    const assessmentTypeId = typeMap.get('assessment');
    const learnerTypeIdSeed = typeMap.get('learner');
    const subjectTypeIdSeed = typeMap.get('subject');
    const termTypeIdSeed = typeMap.get('term');
    const teacherTypeIdSeed = typeMap.get('teacher');
    const classTypeIdSeed = typeMap.get('class');

    const assessmentRelPairs: Array<{ targetTypeId: string | undefined; cardinality: string; description: string }> = [
      { targetTypeId: learnerTypeIdSeed, cardinality: 'many-many', description: 'Assessment result for a learner' },
      { targetTypeId: subjectTypeIdSeed, cardinality: 'many-many', description: 'Assessment for a subject' },
      { targetTypeId: termTypeIdSeed, cardinality: 'many-many', description: 'Assessment in a term' },
      { targetTypeId: teacherTypeIdSeed, cardinality: 'many-many', description: 'Assessment recorded by a teacher' },
      { targetTypeId: classTypeIdSeed, cardinality: 'many-many', description: 'Assessment for a class' },
    ];

    for (const pair of assessmentRelPairs) {
      if (!assessmentTypeId || !pair.targetTypeId) continue;
      const existing = relDefs.find(rd =>
        (rd.fromEntityTypeId === assessmentTypeId && rd.toEntityTypeId === pair.targetTypeId) ||
        (rd.fromEntityTypeId === pair.targetTypeId && rd.toEntityTypeId === assessmentTypeId)
      );
      if (!existing) {
        await db.insert(relationshipDefinitions).values({
          schoolId,
          fromEntityTypeId: assessmentTypeId,
          toEntityTypeId: pair.targetTypeId,
          cardinality: pair.cardinality as any,
          description: pair.description,
          isActive: true,
          isDefault: true,
        });
      }
    }

    // ─── Class↔Learner Relationship Definition ───
    if (classTypeIdSeed && learnerTypeIdSeed) {
      const existingClassLearner = relDefs.find(rd =>
        (rd.fromEntityTypeId === classTypeIdSeed && rd.toEntityTypeId === learnerTypeIdSeed) ||
        (rd.fromEntityTypeId === learnerTypeIdSeed && rd.toEntityTypeId === classTypeIdSeed)
      );
      if (!existingClassLearner) {
        await db.insert(relationshipDefinitions).values({
          schoolId,
          fromEntityTypeId: classTypeIdSeed,
          toEntityTypeId: learnerTypeIdSeed,
          cardinality: 'many-many' as any,
          description: 'Learner enrolled in a class',
          isActive: true,
          isDefault: true,
        });
      }
    }

    // Re-fetch relationship definitions after creating assessment + class-learner ones
    const allRelDefs = await db.query.relationshipDefinitions.findMany({
      where: (rd, { and: a, eq: e }) => a(e(rd.schoolId, schoolId), e(rd.isActive, true)),
    });

    const assessLearnerRel = allRelDefs.find(rd =>
      assessmentTypeId && learnerTypeIdSeed && (
        (rd.fromEntityTypeId === assessmentTypeId && rd.toEntityTypeId === learnerTypeIdSeed) ||
        (rd.fromEntityTypeId === learnerTypeIdSeed && rd.toEntityTypeId === assessmentTypeId)
      )
    );
    const assessSubjectRel = allRelDefs.find(rd =>
      assessmentTypeId && subjectTypeIdSeed && (
        (rd.fromEntityTypeId === assessmentTypeId && rd.toEntityTypeId === subjectTypeIdSeed) ||
        (rd.fromEntityTypeId === subjectTypeIdSeed && rd.toEntityTypeId === assessmentTypeId)
      )
    );
    const assessTermRel = allRelDefs.find(rd =>
      assessmentTypeId && termTypeIdSeed && (
        (rd.fromEntityTypeId === assessmentTypeId && rd.toEntityTypeId === termTypeIdSeed) ||
        (rd.fromEntityTypeId === termTypeIdSeed && rd.toEntityTypeId === assessmentTypeId)
      )
    );
    const assessClassRel = allRelDefs.find(rd =>
      assessmentTypeId && classTypeIdSeed && (
        (rd.fromEntityTypeId === assessmentTypeId && rd.toEntityTypeId === classTypeIdSeed) ||
        (rd.fromEntityTypeId === classTypeIdSeed && rd.toEntityTypeId === assessmentTypeId)
      )
    );

    // ─── Class↔Learner Enrollment Records ───
    // Link learners to their child classes via relationship records
    const classLearnerRel = allRelDefs.find(rd =>
      classTypeIdSeed && learnerTypeIdSeed && (
        (rd.fromEntityTypeId === classTypeIdSeed && rd.toEntityTypeId === learnerTypeIdSeed) ||
        (rd.fromEntityTypeId === learnerTypeIdSeed && rd.toEntityTypeId === classTypeIdSeed)
      )
    );

    if (classLearnerRel && childClassIds.length > 0 && learnerIds.length > 0) {
      const classRelRows: any[] = [];
      const isFrom = classLearnerRel.fromEntityTypeId === classTypeIdSeed;
      // Distribute 100 learners evenly across 16 child classes (~6-7 per class)
      for (let i = 0; i < learnerIds.length; i++) {
        const classIdx = i % childClassIds.length;
        classRelRows.push({
          schoolId,
          relationshipDefinitionId: classLearnerRel.id,
          fromEntityRecordId: isFrom ? childClassIds[classIdx] : learnerIds[i],
          toEntityRecordId: isFrom ? learnerIds[i] : childClassIds[classIdx],
        });
      }
      for (let i = 0; i < classRelRows.length; i += 100) {
        await db.insert(relationshipRecords).values(classRelRows.slice(i, i + 100));
      }
    }

    // ─── Assessments (60) — logically connected ───
    const ASSESS_TYPES = ['Exam', 'Quiz', 'Assignment', 'CAT'];
    const GRADE1A_CHILD = childClassIds[0]; // Grade 1A
    const assessmentData: Array<{ name: string; subjectIdx: number; termIdx: number; learnerIdx: number; type: string; maxScore: number }> = [];

    for (let ti = 0; ti < termIds.length; ti++) {
      for (let si = 0; si < subjectIds.length; si++) {
        const subjName = SUBJS[si].n;
        const typeName = pick(ASSESS_TYPES);
        const maxScore = typeName === 'Exam' ? 100 : typeName === 'CAT' ? 50 : 30;
        // Create 3 assessments per subject-term (for 3 different learners)
        for (let li = 0; li < 3; li++) {
          assessmentData.push({
            name: `${typeName} ${subjName} - ${termIds.length > 0 ? `Term ${ti + 1}` : ''}`,
            subjectIdx: si,
            termIdx: ti,
            learnerIdx: (ti * subjectIds.length * 3 + si * 3 + li) % learnerIds.length,
            type: typeName,
            maxScore,
          });
        }
      }
    }

    const assessmentIds = await batch('assessment', assessmentData.map(d => ({
      assessment_name: d.name,
      type: d.type,
      subject: SUBJS[d.subjectIdx].n,
      max_score: d.maxScore,
      date: `2026-${String(d.termIdx * 3 + randBetween(1, 3)).padStart(2, '0')}-${String(randBetween(1, 28)).padStart(2, '0')}`,
      status: d.termIdx < 2 ? pick(['Completed', 'Graded']) : 'Scheduled',
    })));
    counts.assessments = assessmentIds.length;

    // Link assessments to learners, subjects, terms, and classes
    const assessRelRows: any[] = [];
    for (let i = 0; i < assessmentIds.length; i++) {
      const aId = assessmentIds[i];
      const d = assessmentData[i];

      // Link to learner
      if (assessLearnerRel && learnerIds.length > 0) {
        const learnerId = learnerIds[d.learnerIdx];
        const isFrom = assessLearnerRel.fromEntityTypeId === assessmentTypeId;
        assessRelRows.push({
          schoolId, relationshipDefinitionId: assessLearnerRel.id,
          fromEntityRecordId: isFrom ? aId : learnerId,
          toEntityRecordId: isFrom ? learnerId : aId,
        });
      }
      // Link to subject (the CORRECT subject, not random)
      if (assessSubjectRel && subjectIds.length > 0) {
        const subjectId = subjectIds[d.subjectIdx];
        const isFrom = assessSubjectRel.fromEntityTypeId === assessmentTypeId;
        assessRelRows.push({
          schoolId, relationshipDefinitionId: assessSubjectRel.id,
          fromEntityRecordId: isFrom ? aId : subjectId,
          toEntityRecordId: isFrom ? subjectId : aId,
        });
      }
      // Link to term
      if (assessTermRel && termIds.length > 0) {
        const termId = termIds[d.termIdx];
        const isFrom = assessTermRel.fromEntityTypeId === assessmentTypeId;
        assessRelRows.push({
          schoolId, relationshipDefinitionId: assessTermRel.id,
          fromEntityRecordId: isFrom ? aId : termId,
          toEntityRecordId: isFrom ? termId : aId,
        });
      }
      // Link to class (Grade 1A)
      if (assessClassRel && GRADE1A_CHILD) {
        const isFrom = assessClassRel.fromEntityTypeId === assessmentTypeId;
        assessRelRows.push({
          schoolId, relationshipDefinitionId: assessClassRel.id,
          fromEntityRecordId: isFrom ? aId : GRADE1A_CHILD,
          toEntityRecordId: isFrom ? GRADE1A_CHILD : aId,
        });
      }
    }
    if (assessRelRows.length) {
      for (let i = 0; i < assessRelRows.length; i += 100) {
        await db.insert(relationshipRecords).values(assessRelRows.slice(i, i + 100));
      }
    }

    // ─── Roles ───
    for (const r of ['Principal','Deputy Principal','Head Teacher','Class Teacher','Subject Teacher','Librarian','Nurse','Accountant','Admin Staff']) {
      const ex = await db.query.roles.findFirst({ where: and(eq(roles.schoolId, schoolId), eq(roles.name, r)) });
      if (!ex) await db.insert(roles).values({ schoolId, name: r, isSystem: r === 'Principal' });
    }

    return c.json({ success: true, data: counts });
  } catch (err: any) {
    console.error('Seed error:', err);
    return c.json({ error: err.message, stack: err.stack }, 500);
  }
});

seed.get('/test', async (c) => {
  try {
    const schoolId = c.get('schoolId' as never) as string;
    const types = await db.query.entityTypes.findMany({ where: eq(entityTypes.schoolId, schoolId) });
    return c.json({ ok: true, types: types.map(t => t.internalName) });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

seed.get('/counts/:schoolId', async (c) => {
  const schoolId = c.req.param('schoolId');
  const types = await db.query.entityTypes.findMany({ where: eq(entityTypes.schoolId, schoolId) });
  const counts: Record<string, number> = {};
  for (const t of types) {
    const recs = await db.query.entityRecords.findMany({ where: and(eq(entityRecords.schoolId, schoolId), eq(entityRecords.entityTypeId, t.id)) });
    counts[t.internalName] = recs.length;
  }
  return c.json(counts);
});

// ─── Cleanup: delete all entity records, field values, and relationships for a school ───
seed.post('/cleanup/:schoolId', async (c) => {
  if (process.env.NODE_ENV !== 'development') {
    return c.json({ error: 'Cleanup is only available in development mode' }, 403);
  }
  const schoolId = c.req.param('schoolId');
  try {
    await db.execute(sql`DELETE FROM relationship_records WHERE from_entity_record_id IN (SELECT id FROM entity_records WHERE school_id = ${schoolId})`);
    await db.execute(sql`DELETE FROM relationship_records WHERE to_entity_record_id IN (SELECT id FROM entity_records WHERE school_id = ${schoolId})`);
    await db.execute(sql`DELETE FROM field_values WHERE entity_record_id IN (SELECT id FROM entity_records WHERE school_id = ${schoolId})`);
    await db.execute(sql`DELETE FROM entity_records WHERE school_id = ${schoolId}`);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default seed;
